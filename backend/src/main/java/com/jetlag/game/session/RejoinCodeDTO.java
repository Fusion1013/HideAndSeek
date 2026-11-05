package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** A one-time code the host hands to a player, as a link, to get their place in the game back on any device. */
public record RejoinCodeDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID playerId,
  @Schema(description = "Works once, until it expires; it is not sent again", requiredMode = Schema.RequiredMode.REQUIRED)
  String code,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant expiresAt
) {
}
