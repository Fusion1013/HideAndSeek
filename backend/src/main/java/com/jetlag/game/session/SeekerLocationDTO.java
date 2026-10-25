package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** Where a seeker last reported being. Only ever sent to hiders. */
public record SeekerLocationDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID playerId,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
  @Schema(description = "Radius of the 95% confidence circle, in metres") Float accuracyMeters,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant recordedAt
) {
  static SeekerLocationDTO from(GamePlayerEntity seeker) {
    return new SeekerLocationDTO(seeker.getId(), seeker.getLastLocation().getX(), seeker.getLastLocation().getY(),
      seeker.getLastLocationAccuracyMeters(), seeker.getLastLocationAt());
  }
}
