package com.jetlag.game.session;

import com.jetlag.transit.model.CalendarEntity;
import com.jetlag.transit.reachability.ReachabilityService;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The stations a game is played on: copied from the GTFS data when the game is created, so a later import
 * cannot change or remove them mid-game.
 */
@Repository
public class GameStations {

  /**
   * The part of the day a station must be served throughout, in GTFS times. Daytime only, as every station has a long
   * gap at night, and within a single service day, so trips running past midnight do not come into it.
   */
  private static final int DAY_START_SECONDS = 8 * 3600;
  private static final int DAY_END_SECONDS = 20 * 3600;
  /** GTFS pickup_type and drop_off_type: no pickup, or no drop off, at this stop. */
  private static final int NOT_AVAILABLE = 1;

  private final JdbcTemplate jdbcTemplate;
  private final Clock clock;

  public GameStations(JdbcTemplate jdbcTemplate, Clock clock) {
    this.jdbcTemplate = jdbcTemplate;
    this.clock = clock;
  }

  /**
   * Copies every station served by one of the routes and inside the game's area. Platforms and entrances count
   * as their parent station, which is where the station's name and position come from; a stop without a parent
   * is a station of its own. With {@code maxGapMinutes}, only those {@link #servedEvery served that often} today.
   * Returns how many stations were copied.
   */
  public int snapshot(UUID gameId, Collection<String> routeIds, Integer maxGapMinutes) {
    if (routeIds.isEmpty()) return 0;
    int copied = copyStations(gameId, routeIds);
    if (maxGapMinutes == null) return copied;
    Set<String> served = servedEvery(maxGapMinutes, routeIds);
    return jdbcTemplate.execute((ConnectionCallback<Integer>) connection -> {
      try (PreparedStatement statement = connection.prepareStatement(
        "DELETE FROM game_station WHERE game_id = ? AND station_id <> ALL(?)")) {
        statement.setObject(1, gameId);
        statement.setArray(2, connection.createArrayOf("text", served.toArray()));
        return copied - statement.executeUpdate();
      }
    });
  }

  private int copyStations(UUID gameId, Collection<String> routeIds) {
    return jdbcTemplate.execute((ConnectionCallback<Integer>) connection -> {
      try (PreparedStatement statement = connection.prepareStatement("""
        INSERT INTO game_station (game_id, station_id, name, location)
        SELECT DISTINCT ON (station.stop_id)
               game.id, station.stop_id, COALESCE(NULLIF(station.stop_name, ''), station.stop_id),
               ST_SetSRID(ST_MakePoint(station.stop_lon, station.stop_lat), 4326)
        FROM game
        JOIN gtfs_route_stops route_stop ON route_stop.route_id = ANY(?)
        JOIN gtfs_stops stop ON stop.stop_id = route_stop.stop_id
        LEFT JOIN gtfs_stops parent ON parent.stop_id = stop.parent_station
        -- The parent station where there is one, else the stop itself
        JOIN gtfs_stops station ON station.stop_id = COALESCE(parent.stop_id, stop.stop_id)
        WHERE game.id = ?
          AND station.stop_lat IS NOT NULL AND station.stop_lon IS NOT NULL
          AND ST_Contains(game.boundary, ST_SetSRID(ST_MakePoint(station.stop_lon, station.stop_lat), 4326))
        ORDER BY station.stop_id
        """)) {
        Array ids = connection.createArrayOf("text", routeIds.toArray());
        statement.setArray(1, ids);
        statement.setObject(2, gameId);
        return statement.executeUpdate();
      }
    });
  }

  /**
   * The stations a game from this template would have, now: chosen as {@link #snapshot} chooses them, from the
   * template's own area. By name.
   */
  public List<StationDTO> forTemplate(UUID templateId, Collection<String> routeIds, Integer maxGapMinutes) {
    if (routeIds.isEmpty()) return List.of();
    Set<String> served = maxGapMinutes == null ? null : servedEvery(maxGapMinutes, routeIds);
    List<StationDTO> stations = jdbcTemplate.execute((ConnectionCallback<List<StationDTO>>) connection -> {
      try (PreparedStatement statement = connection.prepareStatement("""
        SELECT DISTINCT ON (station.stop_id)
               station.stop_id AS station_id, COALESCE(NULLIF(station.stop_name, ''), station.stop_id) AS name,
               station.stop_lon AS longitude, station.stop_lat AS latitude
        FROM game_template template
        JOIN gtfs_route_stops route_stop ON route_stop.route_id = ANY(?)
        JOIN gtfs_stops stop ON stop.stop_id = route_stop.stop_id
        LEFT JOIN gtfs_stops parent ON parent.stop_id = stop.parent_station
        JOIN gtfs_stops station ON station.stop_id = COALESCE(parent.stop_id, stop.stop_id)
        WHERE template.id = ?
          AND station.stop_lat IS NOT NULL AND station.stop_lon IS NOT NULL
          AND ST_Contains(template.boundary, ST_SetSRID(ST_MakePoint(station.stop_lon, station.stop_lat), 4326))
        ORDER BY station.stop_id
        """)) {
        statement.setArray(1, connection.createArrayOf("text", routeIds.toArray()));
        statement.setObject(2, templateId);
        try (ResultSet rows = statement.executeQuery()) {
          List<StationDTO> found = new ArrayList<>();
          while (rows.next()) found.add(STATION_ROW.mapRow(rows, found.size()));
          return found;
        }
      }
    });
    return stations == null ? List.of() : stations.stream()
      .filter(station -> served == null || served.contains(station.stationId()))
      .sorted(Comparator.comparing(StationDTO::name).thenComparing(StationDTO::stationId))
      .toList();
  }

  /**
   * The stations with a vehicle of one of the routes at most {@code maxGapMinutes} apart through today's daytime, its
   * start and end included, whichever direction it is going. A vehicle counts if it can be got on or off. Stops with
   * no time of their own (GTFS leaves them to be interpolated) do not count.
   */
  private Set<String> servedEvery(int maxGapMinutes, Collection<String> routeIds) {
    LocalDate today = clock.instant().atZone(ReachabilityService.TIMETABLE_ZONE).toLocalDate();
    List<String> stations = jdbcTemplate.execute((ConnectionCallback<List<String>>) connection -> {
      try (PreparedStatement statement = connection.prepareStatement("""
        WITH visit AS (
          SELECT DISTINCT COALESCE(parent.stop_id, stop.stop_id) AS station_id, called.seconds
          FROM gtfs_trips trip
          JOIN gtfs_stop_times stop_time ON stop_time.trip_id = trip.trip_id
          JOIN gtfs_stops stop ON stop.stop_id = stop_time.stop_id
          LEFT JOIN gtfs_stops parent ON parent.stop_id = stop.parent_station
          -- GTFS hours pass 24, which an interval allows; anything malformed has no time and is left out
          CROSS JOIN LATERAL (
            SELECT CASE WHEN at ~ '^[0-9]+:[0-5][0-9]:[0-5][0-9]$' THEN EXTRACT(EPOCH FROM at::interval)::int END AS seconds
            FROM (SELECT COALESCE(stop_time.departure_time, stop_time.arrival_time) AS at) times
          ) called
          WHERE trip.route_id = ANY(?)
            AND trip.service_id IN (%s)
            AND called.seconds BETWEEN ? AND ?
            AND NOT (COALESCE(stop_time.pickup_type, 0) = %2$d AND COALESCE(stop_time.drop_off_type, 0) = %2$d)
        ), moment AS (
          SELECT station_id, seconds FROM visit
          UNION SELECT station_id, ? FROM visit
          UNION SELECT station_id, ? FROM visit
        )
        SELECT station_id
        FROM (
          SELECT station_id, seconds - lag(seconds) OVER (PARTITION BY station_id ORDER BY seconds) AS gap
          FROM moment
        ) gaps
        GROUP BY station_id
        HAVING max(gap) <= ?
        """.formatted(CalendarEntity.runningServices(today.getDayOfWeek()), NOT_AVAILABLE))) {
        int parameter = 1;
        statement.setArray(parameter++, connection.createArrayOf("text", routeIds.toArray()));
        for (int i = 0; i < 3; i++) statement.setDate(parameter++, Date.valueOf(today));
        statement.setInt(parameter++, DAY_START_SECONDS);
        statement.setInt(parameter++, DAY_END_SECONDS);
        statement.setInt(parameter++, DAY_START_SECONDS);
        statement.setInt(parameter++, DAY_END_SECONDS);
        statement.setInt(parameter, maxGapMinutes * 60);
        try (ResultSet rows = statement.executeQuery()) {
          List<String> found = new ArrayList<>();
          while (rows.next()) found.add(rows.getString("station_id"));
          return found;
        }
      }
    });
    return stations == null ? Set.of() : Set.copyOf(stations);
  }

  public int count(UUID gameId) {
    Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM game_station WHERE game_id = ?", Integer.class, gameId);
    return count == null ? 0 : count;
  }

  /** The game's stations, by name. */
  public List<StationDTO> list(UUID gameId) {
    return jdbcTemplate.query(STATION_SELECT + " WHERE game_id = ? ORDER BY name, station_id", STATION_ROW, gameId);
  }

  public Optional<StationDTO> find(UUID gameId, String stationId) {
    return jdbcTemplate.query(STATION_SELECT + " WHERE game_id = ? AND station_id = ?", STATION_ROW, gameId, stationId)
      .stream().findFirst();
  }

  private static final String STATION_SELECT =
    "SELECT station_id, name, ST_X(location) AS longitude, ST_Y(location) AS latitude FROM game_station";

  private static final RowMapper<StationDTO> STATION_ROW = (row, index) -> new StationDTO(
    row.getString("station_id"), row.getString("name"), row.getDouble("longitude"), row.getDouble("latitude"));
}
