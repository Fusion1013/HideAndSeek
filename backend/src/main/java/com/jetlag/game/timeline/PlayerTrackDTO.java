package com.jetlag.game.timeline;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

/** The positions one player reported during the game, oldest first. */
public record PlayerTrackDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID playerId,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TrackPointDTO> points
) {
}
