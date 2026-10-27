package com.jetlag.transit.reachability;

import com.jetlag.transit.model.CalendarDateEntity;
import com.jetlag.transit.model.CalendarEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Reads the stops and the stop times of a time window for {@link ReachabilityService}. The stop times are
 * streamed, not loaded into entities: a window of a few hours holds over a million of them.
 */
@Repository
class ReachabilityQueries implements ReachabilityService.TripData {

  private static final int SECONDS_PER_DAY = 86_400;
  /**
   * How long before the window to also read stop times, for a vehicle that arrived before the start but leaves
   * after it. Matched on arrival time, which is the column the window is read by.
   */
  private static final int DWELL_MARGIN_SECONDS = 30 * 60;
  private static final int FETCH_SIZE = 10_000;
  /** GTFS pickup_type and drop_off_type: no pickup, or no drop off, at this stop. */
  private static final int NOT_AVAILABLE = 1;

  private final JdbcTemplate jdbcTemplate;

  ReachabilityQueries(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  List<StationIndex.Stop> stops() {
    return jdbcTemplate.query(
      "SELECT stop_id, stop_name, stop_lat, stop_lon, parent_station FROM gtfs_stops",
      (row, index) -> new StationIndex.Stop(
        row.getString("stop_id"),
        row.getString("stop_name"),
        row.getObject("stop_lat", Double.class),
        row.getObject("stop_lon", Double.class),
        row.getString("parent_station")));
  }

  /** What a trip is, as a traveller sees it. */
  record TripDetails(String routeId, String routeShortName, String routeLongName, String routeType,
                     String agencyName, String headsign, String shapeId) {}

  /** The details of these trips, by trip_id; trips the timetable does not have are left out. */
  @Override
  public Map<String, TripDetails> tripDetails(Collection<String> tripIds) {
    if (tripIds.isEmpty()) return Map.of();
    Map<String, TripDetails> details = new HashMap<>();
    jdbcTemplate.query(
      connection -> {
        PreparedStatement statement = connection.prepareStatement("""
          SELECT t.trip_id, COALESCE(NULLIF(t.trip_headsign, ''), last_stop.stop_name) AS headsign, r.route_id,
                 r.route_short_name, r.route_long_name, r.route_type, a.agency_name, t.shape_id
          FROM gtfs_trips t
          JOIN gtfs_routes r ON r.route_id = t.route_id
          LEFT JOIN gtfs_agency a ON a.agency_id = r.agency_id
          -- Many feeds leave out the headsign; the trip's last stop says the same
          LEFT JOIN LATERAL (
            SELECT s.stop_name FROM gtfs_stop_times st JOIN gtfs_stops s ON s.stop_id = st.stop_id
            WHERE st.trip_id = t.trip_id ORDER BY st.stop_sequence DESC LIMIT 1
          ) last_stop ON true
          WHERE t.trip_id = ANY (?)
          """);
        statement.setArray(1, connection.createArrayOf("text", tripIds.toArray()));
        return statement;
      },
      (RowCallbackHandler) row -> details.put(row.getString("trip_id"), new TripDetails(
        row.getString("route_id"),
        row.getString("route_short_name"),
        row.getString("route_long_name"),
        row.getString("route_type"),
        row.getString("agency_name"),
        row.getString("headsign"),
        row.getString("shape_id"))));
    return details;
  }

  /** The shapes' points in order along each, by shape_id; shapes the timetable does not have are left out. */
  @Override
  public Map<String, List<ShapePath.Point>> shapes(Collection<String> shapeIds) {
    if (shapeIds.isEmpty()) return Map.of();
    Map<String, List<ShapePath.Point>> shapes = new HashMap<>();
    jdbcTemplate.query(
      connection -> {
        PreparedStatement statement = connection.prepareStatement("""
          SELECT shape_id, ST_Y((point).geom) AS latitude, ST_X((point).geom) AS longitude
          FROM (SELECT shape_id, ST_DumpPoints(geometry) AS point FROM gtfs_shape_lines WHERE shape_id = ANY (?)) points
          ORDER BY shape_id, (point).path[1]
          """);
        statement.setArray(1, connection.createArrayOf("text", shapeIds.toArray()));
        return statement;
      },
      (RowCallbackHandler) row -> shapes.computeIfAbsent(row.getString("shape_id"), id -> new ArrayList<>())
        .add(new ShapePath.Point(row.getDouble("latitude"), row.getDouble("longitude"))));
    return shapes;
  }

  /** Whether a GTFS calendar has been imported, without which no trip is known to run on any day. */
  boolean hasCalendar() {
    return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
      "SELECT EXISTS (SELECT 1 FROM gtfs_calendar) OR EXISTS (SELECT 1 FROM gtfs_calendar_dates)", Boolean.class));
  }

  /**
   * The connections between {@code startSeconds} and {@code startSeconds + durationSeconds} after midnight on
   * {@code date}, of the trips that run that day. This includes trips of the previous service day (times past
   * 24:00) and of the next (when the window passes midnight), each counted only if it runs on its own service
   * day. Must run in a transaction so that PostgreSQL streams the rows instead of loading them all.
   */
  Timetable timetable(StationIndex stations, LocalDate date, int startSeconds, int durationSeconds) {
    // The window in the GTFS times of yesterday's, today's and tomorrow's service days. They are far apart, so a
    // trip's stop times all fall in the same one; all are read in one pass over the table.
    List<Window> windows = new ArrayList<>();
    for (int day = -1; day <= 1; day++) {
      int start = startSeconds - day * SECONDS_PER_DAY;
      int end = start + durationSeconds;
      if (end >= 0) {
        windows.add(new Window(windows.size(), date.plusDays(day), Math.max(start - DWELL_MARGIN_SECONDS, 0), end, start));
      }
    }

    Map<String, Integer> runningTrips = runningTrips(windows);

    Timetable.Builder builder = Timetable.builder();
    // The trips are filtered while reading rather than joined here: with a join PostgreSQL sorts every stop time of
    // the windows before joining, which takes about twice as long as this scan
    String ranges = String.join(" OR ", Collections.nCopies(windows.size(), "arrival_time BETWEEN ? AND ?"));
    jdbcTemplate.query(
      connection -> {
        PreparedStatement statement = connection.prepareStatement("""
          SELECT trip_id, stop_id, arrival_time, departure_time, pickup_type, drop_off_type
          FROM gtfs_stop_times
          WHERE %s
          ORDER BY trip_id, stop_sequence
          """.formatted(ranges));
        int parameter = 1;
        for (Window window : windows) {
          // GTFS times have two-digit hours, so they compare as text
          statement.setString(parameter++, gtfsTime(window.from()));
          statement.setString(parameter++, gtfsTime(window.to()));
        }
        statement.setFetchSize(FETCH_SIZE);
        return statement;
      },
      new ConnectionReader(stations, builder, windows, runningTrips, durationSeconds));
    return builder.build();
  }

  /**
   * The trips that run on the service date of each window, with the windows they run in as a bit mask: bit
   * {@code i} for the {@code i}th window. A service runs on a date when its calendar has that weekday in its date
   * range or calendar_dates adds the date, unless calendar_dates removes it.
   */
  private Map<String, Integer> runningTrips(List<Window> windows) {
    String trips = windows.stream()
      .map(window -> """
        SELECT trip_id, %d AS service_day FROM gtfs_trips WHERE service_id IN (
          SELECT service_id FROM gtfs_calendar WHERE ? BETWEEN start_date AND end_date AND %s
          UNION SELECT service_id FROM gtfs_calendar_dates WHERE date = ? AND exception_type = %d
          EXCEPT SELECT service_id FROM gtfs_calendar_dates WHERE date = ? AND exception_type = %d)
        """.formatted(window.index(), CalendarEntity.column(window.date().getDayOfWeek()),
        CalendarDateEntity.ADDED, CalendarDateEntity.REMOVED))
      .collect(Collectors.joining(" UNION ALL "));

    Map<String, Integer> running = new HashMap<>();
    jdbcTemplate.query(
      connection -> {
        PreparedStatement statement = connection.prepareStatement(trips);
        int parameter = 1;
        for (Window window : windows) {
          Date serviceDate = Date.valueOf(window.date());
          statement.setDate(parameter++, serviceDate);
          statement.setDate(parameter++, serviceDate);
          statement.setDate(parameter++, serviceDate);
        }
        statement.setFetchSize(FETCH_SIZE);
        return statement;
      },
      (RowCallbackHandler) row -> running.merge(row.getString("trip_id"), 1 << row.getInt("service_day"),
        (mask, day) -> mask | day));
    return running;
  }

  /**
   * Stop times read for one service day, the {@code index}th: arriving between {@code from} and {@code to}, with
   * {@code start} the start of the search, all in the GTFS times of {@code date}.
   */
  private record Window(int index, LocalDate date, int from, int to, int start) {
    boolean contains(int seconds) {
      return seconds >= from && seconds <= to;
    }
  }

  /** Turns consecutive stop times of a trip into connections, for the trips that run in their window. */
  private static final class ConnectionReader implements RowCallbackHandler {
    private final StationIndex stations;
    private final Timetable.Builder builder;
    private final List<Window> windows;
    private final Map<String, Integer> runningTrips;
    private final int durationSeconds;

    private String tripId;
    /** The windows the current trip runs in, as {@link #runningTrips} gives them. */
    private int tripWindows;
    private Window window;
    private int previousStation = -1;
    /** Seconds after the start of the search. */
    private int previousDeparture;
    private boolean previousBoardable;

    ConnectionReader(StationIndex stations, Timetable.Builder builder, List<Window> windows,
                     Map<String, Integer> runningTrips, int durationSeconds) {
      this.stations = stations;
      this.builder = builder;
      this.windows = windows;
      this.runningTrips = runningTrips;
      this.durationSeconds = durationSeconds;
    }

    @Override
    public void processRow(ResultSet row) throws SQLException {
      String rowTripId = row.getString("trip_id");
      if (!rowTripId.equals(tripId)) {
        tripId = rowTripId;
        tripWindows = runningTrips.getOrDefault(rowTripId, 0);
        window = null;
      }
      if (tripWindows == 0) return;

      int arrivalTime = parseGtfsTime(row.getString("arrival_time"));
      int departureTime = parseGtfsTime(row.getString("departure_time"));
      Window rowWindow = windowOf(arrivalTime);
      if (rowWindow != window) {
        // A trip that runs on two of the service days is two vehicles, one in each window
        window = rowWindow;
        builder.startTrip(tripId);
        previousStation = -1;
      }
      int station = stations.stationOf(row.getString("stop_id"));
      if (window == null || (tripWindows & 1 << window.index()) == 0 || station < 0 || departureTime < 0) {
        previousStation = -1;
        return;
      }

      int arrival = arrivalTime - window.start();
      if (previousStation >= 0 && previousDeparture >= 0 && arrival >= previousDeparture && arrival <= durationSeconds) {
        builder.add(previousStation, station, previousDeparture, arrival, previousBoardable,
          !Integer.valueOf(NOT_AVAILABLE).equals(row.getObject("drop_off_type", Integer.class)));
      }

      previousStation = station;
      previousDeparture = departureTime - window.start();
      previousBoardable = !Integer.valueOf(NOT_AVAILABLE).equals(row.getObject("pickup_type", Integer.class));
    }

    private Window windowOf(int seconds) {
      for (Window window : windows) {
        if (window.contains(seconds)) return window;
      }
      return null;
    }
  }

  static String gtfsTime(int seconds) {
    return String.format("%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
  }

  /** Seconds after midnight for "H:MM:SS", or -1 when missing or malformed. */
  static int parseGtfsTime(String time) {
    if (time == null) return -1;
    String[] parts = time.trim().split(":");
    if (parts.length != 3) return -1;
    try {
      return Integer.parseInt(parts[0]) * 3600 + Integer.parseInt(parts[1]) * 60 + Integer.parseInt(parts[2]);
    } catch (NumberFormatException e) {
      return -1;
    }
  }
}
