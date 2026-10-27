package com.jetlag.transit.reachability;

import com.jetlag.transit.api.ReachabilityLegDTO;
import com.jetlag.transit.api.ReachabilityLegStopDTO;
import com.jetlag.transit.api.ReachabilityPathPointDTO;
import com.jetlag.transit.api.ReachabilityRouteDTO;
import com.jetlag.transit.api.ReachableStationDTO;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ReachabilityServiceTest {

  /** About 0.009 degrees of latitude per kilometre. */
  private static final double KM = 1 / 111.195;

  // A line A - B - C, 10 km apart, a branch B - D, and E 1 km from C. P is a platform of station A.
  private final StationIndex stations = StationIndex.of(List.of(
    new StationIndex.Stop("A", "Alpha", 59.0, 18.0, null),
    new StationIndex.Stop("P", "Alpha platform", 59.0, 18.0, "A"),
    new StationIndex.Stop("B", "Bravo", 59.0 + 10 * KM, 18.0, null),
    new StationIndex.Stop("C", "Charlie", 59.0 + 20 * KM, 18.0, null),
    new StationIndex.Stop("D", "Delta", 59.0 + 10 * KM, 18.5, null),
    new StationIndex.Stop("E", "Echo", 59.0 + 21 * KM, 18.0, null),
    new StationIndex.Stop("F", "Foxtrot", 59.0 + 0.5 * KM, 18.0, null)));

  @Test
  void platformsBelongToTheirStation() {
    assertThat(stations.stationOf("P")).isEqualTo(stations.stationOf("A"));
    assertThat(stations.stationOf("unknown")).isEqualTo(-1);
  }

  @Test
  void ridesWalksAndMarksTightTransfersUnlikely() {
    Timetable.Builder builder = Timetable.builder();
    // From the platform of A at 0:05 to B at 0:15, then on to C at 0:25
    builder.startTrip();
    builder.add(station("P"), station("B"), 5 * 60, 15 * 60, true, true);
    builder.add(station("B"), station("C"), 15 * 60, 25 * 60, true, true);
    // B to D leaving one minute after the first trip arrives: too tight to be likely
    builder.startTrip();
    builder.add(station("B"), station("D"), 16 * 60, 26 * 60, true, true);

    Map<String, ReachableStationDTO> reachable = byId(
      ReachabilityService.reachable(stations, builder.build(), station("A"), 40 * 60));

    assertThat(reachable.get("A").earliestArrivalSeconds()).isZero();
    assertThat(reachable.get("C").earliestArrivalSeconds()).isEqualTo(25 * 60);
    assertThat(reachable.get("C").likely()).isTrue();
    assertThat(reachable.get("D").earliestArrivalSeconds()).isEqualTo(26 * 60);
    assertThat(reachable.get("D").likely()).isFalse();
    // 1 km from C on foot at 6 km/h: ten minutes
    assertThat(reachable.get("E").earliestArrivalSeconds()).isBetween(35 * 60, 35 * 60 + 1);
    // Half a kilometre from A: five minutes on foot
    assertThat(reachable.get("F").earliestArrivalSeconds()).isBetween(5 * 60, 5 * 60 + 1);
  }

  @Test
  void leavesOutWhatTakesLongerThanTheDuration() {
    Timetable.Builder builder = Timetable.builder();
    builder.startTrip();
    builder.add(station("A"), station("B"), 5 * 60, 15 * 60, true, true);
    builder.add(station("B"), station("C"), 15 * 60, 25 * 60, true, true);

    Map<String, ReachableStationDTO> reachable = byId(
      ReachabilityService.reachable(stations, builder.build(), station("A"), 20 * 60));

    assertThat(reachable).containsKeys("A", "B", "F").doesNotContainKeys("C", "D", "E");
  }

  @Test
  void respectsNoPickupAndNoDropOff() {
    Timetable.Builder builder = Timetable.builder();
    builder.startTrip();
    builder.add(station("A"), station("B"), 5 * 60, 15 * 60, true, false);
    builder.add(station("B"), station("C"), 15 * 60, 25 * 60, true, true);
    builder.startTrip();
    builder.add(station("A"), station("D"), 5 * 60, 15 * 60, false, true);

    Map<String, ReachableStationDTO> reachable = byId(
      ReachabilityService.reachable(stations, builder.build(), station("A"), 30 * 60));

    assertThat(reachable).containsKey("C").doesNotContainKeys("B", "D");
  }

  @Test
  void routesRideTheTripsAndWalkTheRest() {
    Timetable.Builder builder = Timetable.builder();
    builder.startTrip("t1");
    builder.add(station("P"), station("B"), 5 * 60, 15 * 60, true, true);
    builder.add(station("B"), station("C"), 15 * 60, 25 * 60, true, true);
    builder.startTrip("t2");
    builder.add(station("B"), station("D"), 16 * 60, 26 * 60, true, true);
    Map<String, ReachabilityQueries.TripDetails> details = Map.of(
      "t1", new ReachabilityQueries.TripDetails("r1", "40", "Pendeltåg", "109", "SL", "Charlie", "s1"),
      "t2", new ReachabilityQueries.TripDetails("r2", "7", null, "700", "SL", "Delta", null));
    // t1 bends a little east between A and B, and goes on past C
    List<ShapePath.Point> shape = List.of(
      new ShapePath.Point(59.0, 18.0),
      new ShapePath.Point(59.0 + 5 * KM, 18.001),
      new ShapePath.Point(59.0 + 10 * KM, 18.0),
      new ShapePath.Point(59.0 + 20 * KM, 18.0),
      new ShapePath.Point(59.0 + 30 * KM, 18.0));
    ReachabilityService.TripData tripData = new ReachabilityService.TripData() {
      @Override
      public Map<String, ReachabilityQueries.TripDetails> tripDetails(Collection<String> tripIds) {
        return details;
      }

      @Override
      public Map<String, List<ShapePath.Point>> shapes(Collection<String> shapeIds) {
        return shapeIds.contains("s1") ? Map.of("s1", shape) : Map.of();
      }
    };

    Map<String, ReachabilityRouteDTO> routes = ReachabilityService.routes(stations, builder.build(), station("A"),
        40 * 60, List.of(station("E"), station("D"), station("F"), station("A")), tripData)
      .stream().collect(Collectors.toMap(ReachabilityRouteDTO::stopId, Function.identity()));

    // To E: ride t1 to the end, then walk the kilometre from C
    ReachabilityRouteDTO toEcho = routes.get("E");
    assertThat(toEcho.likely()).isTrue();
    assertThat(toEcho.legs()).extracting(ReachabilityLegDTO::mode)
      .containsExactly(ReachabilityLegDTO.Mode.RIDE, ReachabilityLegDTO.Mode.WALK);
    ReachabilityLegDTO ride = toEcho.legs().getFirst();
    assertThat(ride.routeShortName()).isEqualTo("40");
    assertThat(ride.headsign()).isEqualTo("Charlie");
    assertThat(ride.departureSeconds()).isEqualTo(5 * 60);
    assertThat(ride.arrivalSeconds()).isEqualTo(25 * 60);
    assertThat(ride.distanceMeters()).isBetween(19_900.0, 20_100.0);
    assertThat(ride.stops()).extracting(ReachabilityLegStopDTO::stopName).containsExactly("Alpha", "Bravo", "Charlie");
    assertThat(ride.stops().get(1).arrivalSeconds()).isEqualTo(15 * 60);
    assertThat(ride.stops().getFirst().arrivalSeconds()).isNull();
    // Along the shape through its bend, and cut at C rather than going on to its end
    assertThat(ride.path()).extracting(ReachabilityPathPointDTO::longitude).contains(18.001);
    assertThat(ride.path().getLast().latitude()).isCloseTo(59.0 + 20 * KM, within(1e-6));
    ReachabilityLegDTO walk = toEcho.legs().get(1);
    assertThat(walk.path()).isNull();
    assertThat(walk.stops()).extracting(ReachabilityLegStopDTO::stopId).containsExactly("C", "E");
    assertThat(walk.departureSeconds()).isEqualTo(25 * 60);
    assertThat(walk.arrivalSeconds()).isEqualTo(toEcho.arrivalSeconds());

    // To D only through the one-minute change at B, so by the quickest route, not a likely one
    ReachabilityRouteDTO toDelta = routes.get("D");
    assertThat(toDelta.likely()).isFalse();
    assertThat(toDelta.legs()).extracting(ReachabilityLegDTO::tripId).containsExactly("t1", "t2");
    assertThat(toDelta.legs().getFirst().stops()).extracting(ReachabilityLegStopDTO::stopId).containsExactly("A", "B");
    assertThat(toDelta.legs().getFirst().path()).hasSize(3);
    // t2 has no shape, so it is drawn through its stops
    assertThat(toDelta.legs().get(1).path()).isNull();

    // To F on foot, and nothing to the origin
    assertThat(routes.get("F").legs()).extracting(ReachabilityLegDTO::mode).containsExactly(ReachabilityLegDTO.Mode.WALK);
    assertThat(routes.get("A").legs()).isEmpty();
  }

  @Test
  void parsesGtfsTimesPastMidnight() {
    assertThat(ReachabilityQueries.parseGtfsTime("25:01:02")).isEqualTo(25 * 3600 + 62);
    assertThat(ReachabilityQueries.parseGtfsTime("bad")).isEqualTo(-1);
    assertThat(ReachabilityQueries.gtfsTime(25 * 3600 + 62)).isEqualTo("25:01:02");
  }

  private int station(String stopId) {
    return stations.stationOf(stopId);
  }

  private static Map<String, ReachableStationDTO> byId(List<ReachableStationDTO> reachable) {
    return reachable.stream().collect(Collectors.toMap(ReachableStationDTO::stopId, Function.identity()));
  }
}
