package com.jetlag.transit.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A station on a leg. Platforms are merged into their station.
 *
 * @param arrivalSeconds   seconds after the start; absent at the first stop of a leg
 * @param departureSeconds seconds after the start; absent at the last stop of a leg
 */
public record ReachabilityLegStopDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String stopId,
  String stopName,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  Integer arrivalSeconds,
  Integer departureSeconds) {
}
