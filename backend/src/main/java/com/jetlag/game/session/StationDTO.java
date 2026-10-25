package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

/** A station of the game: one the hiders may choose to hide at. */
public record StationDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String stationId,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude
) {
}
