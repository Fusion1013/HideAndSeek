package com.jetlag.game.session;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/** What players send to create, join and run a game. */
public final class GameRequests {

  private GameRequests() {
  }

  public record CreateGameRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID templateId,
    @Schema(description = "The host's name in the game", requiredMode = Schema.RequiredMode.REQUIRED,
      maxLength = GameService.MAX_NAME_LENGTH)
    String displayName,
    @Schema(description = "How long the hiders have; " + GameService.DEFAULT_HIDING_MINUTES + " when left out",
      minimum = "" + GameService.MIN_HIDING_MINUTES, maximum = "" + GameService.MAX_HIDING_MINUTES)
    Integer hidingMinutes
  ) {
  }

  public record JoinGameRequest(
    @Schema(description = "As typed: case, spaces and dashes do not matter", requiredMode = Schema.RequiredMode.REQUIRED)
    String inviteCode,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED, maxLength = GameService.MAX_NAME_LENGTH)
    String displayName
  ) {
  }

  public record RoleRequest(
    @Schema(description = "Null to take the role away again") PlayerRole role
  ) {
  }

  public record LocationRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude,
    @Schema(description = "Radius of the 95% confidence circle, in metres") Float accuracyMeters
  ) {
  }

  public record HidingStationRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String stationId
  ) {
  }
}
