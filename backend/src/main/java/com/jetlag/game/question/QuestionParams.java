package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a question is about. */
public record QuestionParams(
  @Schema(description = "The category of place, for matching, measuring and tentacles (e.g. museums, game_station)")
  String category,
  @Schema(description = "The distance in metres, for radar, thermometer and tentacles") Integer distanceMeters,
  @Schema(description = "Where the asking seeker last reported being; null if they had not") Position origin
) {

  public record Position(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double longitude,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double latitude
  ) {
  }
}
