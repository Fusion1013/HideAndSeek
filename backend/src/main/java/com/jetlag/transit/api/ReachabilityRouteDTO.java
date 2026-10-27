package com.jetlag.transit.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * The quickest way to a reachable station. Times are seconds after the start of the search.
 *
 * @param likely whether the route leaves time to spare at every transfer; if not, it is the quickest one with
 *               transfers as tight as the timetable allows
 * @param legs   the rides and walks in order; empty for the station travelled from
 */
public record ReachabilityRouteDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String stopId,
  String stopName,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int arrivalSeconds,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean likely,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ReachabilityLegDTO> legs) {
}
