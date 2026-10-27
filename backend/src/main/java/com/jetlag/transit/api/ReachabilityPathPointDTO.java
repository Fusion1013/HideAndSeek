package com.jetlag.transit.api;

import io.swagger.v3.oas.annotations.media.Schema;

/** A point of a line on the map, in degrees. */
public record ReachabilityPathPointDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude) {
}
