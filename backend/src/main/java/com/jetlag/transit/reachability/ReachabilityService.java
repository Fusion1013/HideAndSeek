package com.jetlag.transit.reachability;

import com.jetlag.transit.api.ReachabilityLegDTO;
import com.jetlag.transit.api.ReachabilityLegStopDTO;
import com.jetlag.transit.api.ReachabilityPathPointDTO;
import com.jetlag.transit.api.ReachabilityRouteDTO;
import com.jetlag.transit.api.ReachableStationDTO;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which stations can be reached from a station within a time, by public transport and on foot. Searched twice:
 * once with transfers as tight as the timetable allows, which gives every station that can be reached, and once
 * with time to spare at every transfer, which gives the ones likely to be reached in practice.
 */
@Service
public class ReachabilityService {

  public static final int MAX_DURATION_MINUTES = 240;
  /** The most stations whose routes are asked for at once. */
  public static final int MAX_ROUTE_TARGETS = 50;

  /** Brisk walking, above the usual 5 km/h. */
  static final double WALKING_METERS_PER_SECOND = 6.0 / 3.6;
  /** Time to get off, find the platform or stop and get on, for a likely connection. */
  static final int LIKELY_TRANSFER_SECONDS = 3 * 60;
  /** About a quarter of an hour on foot between two vehicles. */
  private static final double MAX_TRANSFER_WALK_METERS = 1_500;
  /** About fifty minutes on foot after the last vehicle; longer walks only matter from the origin. */
  private static final double MAX_FINAL_WALK_METERS = 5_000;

  static final ConnectionScan.Profile POSSIBLE = new ConnectionScan.Profile(
    WALKING_METERS_PER_SECOND, 0, MAX_TRANSFER_WALK_METERS, MAX_FINAL_WALK_METERS);
  static final ConnectionScan.Profile LIKELY = new ConnectionScan.Profile(
    WALKING_METERS_PER_SECOND, LIKELY_TRANSFER_SECONDS, MAX_TRANSFER_WALK_METERS, MAX_FINAL_WALK_METERS);

  /** The time zone of the timetable, in which a date without one is taken. */
  static final ZoneId TIMETABLE_ZONE = ZoneId.of("Europe/Stockholm");

  /**
   * How long the timetable of the last search is kept, so that the routes asked for after it are found at once.
   * Short, so that a new import is soon seen.
   */
  private static final Duration TIMETABLE_CACHE_TIME = Duration.ofMinutes(15);

  private final ReachabilityQueries queries;
  private final Clock clock;
  /** The timetable of the last search; only one, since a window of a few hours takes tens of megabytes. */
  private volatile CachedTimetable cached;

  public ReachabilityService(ReachabilityQueries queries, Clock clock) {
    this.queries = queries;
    this.clock = clock;
  }

  /**
   * Read-only transaction, so the stop times are streamed. Without a date, it is today in the timetable's time
   * zone.
   */
  @Transactional(readOnly = true)
  public List<ReachableStationDTO> reachableStations(
    String stopId, LocalDate date, String startTime, int durationMinutes) {
    Search search = search(stopId, date, startTime, durationMinutes);
    return reachable(search.timetable().stations(), search.timetable().timetable(), search.origin(),
      search.durationSeconds());
  }

  /**
   * The quickest route to each of the stations, for the same search as {@link #reachableStations}. Stations that
   * cannot be reached in time are left out.
   */
  @Transactional(readOnly = true)
  public List<ReachabilityRouteDTO> routes(
    String stopId, LocalDate date, String startTime, int durationMinutes, Collection<String> targetStopIds) {
    if (targetStopIds.isEmpty() || targetStopIds.size() > MAX_ROUTE_TARGETS) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "Ask for the routes to between 1 and " + MAX_ROUTE_TARGETS + " stations");
    }
    Search search = search(stopId, date, startTime, durationMinutes);
    StationIndex stations = search.timetable().stations();
    Set<Integer> targets = new LinkedHashSet<>();
    for (String target : targetStopIds) {
      int station = stations.stationOf(target);
      if (station >= 0) targets.add(station);
    }
    return routes(stations, search.timetable().timetable(), search.origin(), search.durationSeconds(), targets,
      queries);
  }

  private Search search(String stopId, LocalDate date, String startTime, int durationMinutes) {
    LocalDate day = date != null ? date : LocalDate.now(clock.withZone(TIMETABLE_ZONE));
    LocalTime start = parseStartTime(startTime);
    if (durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "The duration must be between 1 and " + MAX_DURATION_MINUTES + " minutes");
    }
    int durationSeconds = durationMinutes * 60;
    CachedTimetable timetable = timetable(day, start.toSecondOfDay(), durationSeconds);
    int origin = timetable.stations().stationOf(stopId);
    if (origin < 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No station with id " + stopId);
    return new Search(timetable, origin, durationSeconds);
  }

  /** The timetable of the window, from the cache when the last search had the same window. */
  private CachedTimetable timetable(LocalDate day, int startSeconds, int durationSeconds) {
    Instant now = clock.instant();
    CachedTimetable last = cached;
    if (last != null && last.matches(day, startSeconds, durationSeconds)
      && now.isBefore(last.loadedAt().plus(TIMETABLE_CACHE_TIME))) {
      return last;
    }

    StationIndex stations = StationIndex.of(queries.stops());
    if (!queries.hasCalendar()) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
        "The timetable calendar has not been imported yet");
    }
    CachedTimetable loaded = new CachedTimetable(day, startSeconds, durationSeconds, now, stations,
      queries.timetable(stations, day, startSeconds, durationSeconds));
    cached = loaded;
    return loaded;
  }

  static List<ReachableStationDTO> reachable(StationIndex stations, Timetable timetable, int origin, int durationSeconds) {
    int[] possible = ConnectionScan.earliestArrivals(stations, timetable, origin, durationSeconds, POSSIBLE);
    int[] likely = ConnectionScan.earliestArrivals(stations, timetable, origin, durationSeconds, LIKELY);

    List<ReachableStationDTO> reachable = new ArrayList<>();
    for (int index = 0; index < possible.length; index++) {
      if (possible[index] == ConnectionScan.UNREACHED) continue;
      StationIndex.Station station = stations.station(index);
      boolean isLikely = likely[index] != ConnectionScan.UNREACHED;
      reachable.add(new ReachableStationDTO(
        station.stopId(), station.name(), station.latitude(), station.longitude(),
        possible[index], isLikely ? likely[index] : null, isLikely));
    }
    reachable.sort(Comparator.comparingInt(ReachableStationDTO::earliestArrivalSeconds));
    return reachable;
  }

  /**
   * The quickest route to each target: with time to spare at every transfer where there is one in time,
   * otherwise with transfers as tight as the timetable allows.
   */
  static List<ReachabilityRouteDTO> routes(StationIndex stations, Timetable timetable, int origin,
                                           int durationSeconds, Collection<Integer> targets, TripData tripData) {
    ConnectionScan.Result likely = ConnectionScan.scan(stations, timetable, origin, durationSeconds, LIKELY);
    ConnectionScan.Result possible = null;

    List<Route> found = new ArrayList<>();
    for (int target : targets) {
      boolean isLikely = likely.arrivals()[target] != ConnectionScan.UNREACHED;
      if (!isLikely && possible == null) {
        possible = ConnectionScan.scan(stations, timetable, origin, durationSeconds, POSSIBLE);
      }
      ConnectionScan.Result result = isLikely ? likely : possible;
      if (result.arrivals()[target] == ConnectionScan.UNREACHED) continue;
      found.add(new Route(target, result.arrivals()[target], isLikely, mergeWalks(result.journey(target))));
    }

    Set<String> tripIds = new HashSet<>();
    for (Route route : found) {
      for (ConnectionScan.Leg leg : route.legs()) {
        if (leg instanceof ConnectionScan.Ride ride) {
          String tripId = timetable.tripId(timetable.trip(ride.boardConnection()));
          if (tripId != null) tripIds.add(tripId);
        }
      }
    }
    Map<String, ReachabilityQueries.TripDetails> details = tripData.tripDetails(tripIds);
    Set<String> shapeIds = new HashSet<>();
    details.values().forEach(trip -> {
      if (trip.shapeId() != null && !trip.shapeId().isBlank()) shapeIds.add(trip.shapeId());
    });
    Map<String, List<ShapePath.Point>> shapes = tripData.shapes(shapeIds);

    return found.stream().map(route -> {
      StationIndex.Station station = stations.station(route.station());
      List<ReachabilityLegDTO> legs = route.legs().stream()
        .map(leg -> leg instanceof ConnectionScan.Ride ride
          ? ride(stations, timetable, ride, details, shapes)
          : walk(stations, (ConnectionScan.Walk) leg))
        .toList();
      return new ReachabilityRouteDTO(station.stopId(), station.name(), station.latitude(), station.longitude(),
        route.arrival(), route.likely(), legs);
    }).toList();
  }

  /**
   * Walks in a row as one straight walk, which is never longer. The scan can walk on after the last vehicle from
   * a station it walked to.
   */
  private static List<ConnectionScan.Leg> mergeWalks(List<ConnectionScan.Leg> legs) {
    List<ConnectionScan.Leg> merged = new ArrayList<>();
    for (ConnectionScan.Leg leg : legs) {
      if (leg instanceof ConnectionScan.Walk walk && !merged.isEmpty()
        && merged.getLast() instanceof ConnectionScan.Walk previous) {
        merged.set(merged.size() - 1,
          new ConnectionScan.Walk(previous.from(), walk.to(), previous.departure(), walk.arrival()));
      } else {
        merged.add(leg);
      }
    }
    return merged;
  }

  private static ReachabilityLegDTO walk(StationIndex stations, ConnectionScan.Walk walk) {
    StationIndex.Station from = stations.station(walk.from());
    StationIndex.Station to = stations.station(walk.to());
    double meters = StationIndex.distanceMeters(from, to);
    // Leaves as soon as it can; time to spare is spent waiting at the end
    int arrival = walk.departure() + (int) Math.ceil(meters / WALKING_METERS_PER_SECOND);
    return new ReachabilityLegDTO(ReachabilityLegDTO.Mode.WALK, walk.departure(), arrival, meters,
      null, null, null, null, null, null, null,
      List.of(legStop(from, null, walk.departure()), legStop(to, arrival, null)), null);
  }

  private static ReachabilityLegDTO ride(StationIndex stations, Timetable timetable, ConnectionScan.Ride ride,
                                         Map<String, ReachabilityQueries.TripDetails> details,
                                         Map<String, List<ShapePath.Point>> shapes) {
    int trip = timetable.trip(ride.boardConnection());
    // The trip's connections in between, in order: the timetable is sorted by departure, and each connection of a
    // trip departs when or after the one before it arrives
    List<ReachabilityLegStopDTO> stops = new ArrayList<>();
    double meters = 0;
    Integer previousArrival = null;
    for (int index = ride.boardConnection(); index <= ride.alightConnection(); index++) {
      if (timetable.trip(index) != trip) continue;
      StationIndex.Station from = stations.station(timetable.from(index));
      StationIndex.Station to = stations.station(timetable.to(index));
      stops.add(legStop(from, previousArrival, timetable.departure(index)));
      meters += StationIndex.distanceMeters(from, to);
      previousArrival = timetable.arrival(index);
      if (index == ride.alightConnection()) stops.add(legStop(to, previousArrival, null));
    }

    String tripId = timetable.tripId(trip);
    ReachabilityQueries.TripDetails about = tripId == null ? null : details.get(tripId);
    return new ReachabilityLegDTO(ReachabilityLegDTO.Mode.RIDE, timetable.departure(ride.boardConnection()),
      timetable.arrival(ride.alightConnection()), meters, tripId,
      about == null ? null : about.routeId(),
      about == null ? null : about.routeShortName(),
      about == null ? null : about.routeLongName(),
      about == null ? null : about.routeType(),
      about == null ? null : about.agencyName(),
      about == null ? null : about.headsign(),
      stops,
      path(about == null || about.shapeId() == null ? null : shapes.get(about.shapeId()), stops));
  }

  /** The ride along its trip's shape, or null when it has none or the stops do not lie along it. */
  private static List<ReachabilityPathPointDTO> path(List<ShapePath.Point> shape, List<ReachabilityLegStopDTO> stops) {
    if (shape == null) return null;
    List<ShapePath.Point> path = ShapePath.between(shape,
      stops.stream().map(stop -> new ShapePath.Point(stop.latitude(), stop.longitude())).toList());
    return path == null ? null
      : path.stream().map(point -> new ReachabilityPathPointDTO(point.latitude(), point.longitude())).toList();
  }

  private static ReachabilityLegStopDTO legStop(StationIndex.Station station, Integer arrival, Integer departure) {
    return new ReachabilityLegStopDTO(station.stopId(), station.name(), station.latitude(), station.longitude(),
      arrival, departure);
  }

  /** What trips are and the shapes they follow, looked up for the routes found. */
  interface TripData {
    /** By trip_id. */
    Map<String, ReachabilityQueries.TripDetails> tripDetails(Collection<String> tripIds);

    /** Each shape's points in order, by shape_id. */
    Map<String, List<ShapePath.Point>> shapes(Collection<String> shapeIds);
  }

  private record Route(int station, int arrival, boolean likely, List<ConnectionScan.Leg> legs) {}

  private record Search(CachedTimetable timetable, int origin, int durationSeconds) {}

  private record CachedTimetable(LocalDate day, int startSeconds, int durationSeconds, Instant loadedAt,
                                 StationIndex stations, Timetable timetable) {
    boolean matches(LocalDate otherDay, int otherStart, int otherDuration) {
      return day.equals(otherDay) && startSeconds == otherStart && durationSeconds == otherDuration;
    }
  }

  private static LocalTime parseStartTime(String startTime) {
    try {
      return LocalTime.parse(startTime);
    } catch (RuntimeException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The start time must be given as HH:MM");
    }
  }
}
