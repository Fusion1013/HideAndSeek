package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/** The answer to creating or joining a game: who the player is, and the token that proves it from now on. */
public record JoinedGameDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID gameId,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID playerId,
  @Schema(description = "Send as a bearer token with every request about this game; it is not sent again",
    requiredMode = Schema.RequiredMode.REQUIRED)
  String playerToken
) {
}
