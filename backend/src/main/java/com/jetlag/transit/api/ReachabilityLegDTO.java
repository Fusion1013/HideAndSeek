package com.jetlag.transit.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * A ride on one trip, or a walk in a straight line, between two stations. Times are seconds after the start of
 * the search. The route and trip fields are only set for a ride.
 *
 * @param distanceMeters in a straight line between the stops passed, for a ride
 * @param stops          every station passed, from the first to the last, with its times; for a walk, its two ends
 * @param path           the way a ride goes, along the trip's shape from the first stop to the last; absent for a
 *                       walk, which goes straight, and for a ride whose trip has no shape that fits its stops
 */
public record ReachabilityLegDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Mode mode,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int departureSeconds,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int arrivalSeconds,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double distanceMeters,
  String tripId,
  String routeId,
  String routeShortName,
  String routeLongName,
  String routeType,
  String agencyName,
  String headsign,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ReachabilityLegStopDTO> stops,
  List<ReachabilityPathPointDTO> path) {

  public enum Mode { RIDE, WALK }
}
