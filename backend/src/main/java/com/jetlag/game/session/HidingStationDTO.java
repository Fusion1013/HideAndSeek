package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** Where the hiders hide. Only ever sent to hiders. */
public record HidingStationDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) StationDTO station,
  @Schema(description = "The hider who chose it", requiredMode = Schema.RequiredMode.REQUIRED) UUID chosenBy,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant chosenAt
) {
}
