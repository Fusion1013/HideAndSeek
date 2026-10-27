package com.jetlag.game.timeline;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

/** Where a player reported being, and when. */
public record TrackPointDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(description = "Radius of the 95% confidence circle, in metres") Float accuracyMeters,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant at
) {
}
