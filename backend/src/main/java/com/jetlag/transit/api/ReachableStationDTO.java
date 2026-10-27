package com.jetlag.transit.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A station that can be reached within the time asked for. Platforms are merged into their station.
 *
 * @param earliestArrivalSeconds seconds after the start, with transfers as tight as the timetable allows
 * @param likelyArrivalSeconds   seconds after the start with time to spare at every transfer; absent when the
 *                               station is only reached through tight transfers
 * @param likely                 whether it is reached with time to spare at every transfer
 */
public record ReachableStationDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String stopId,
  String stopName,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int earliestArrivalSeconds,
  Integer likelyArrivalSeconds,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean likely) {
}
