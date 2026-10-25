package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/** What players send to ask and answer questions. */
public final class QuestionRequests {

  private QuestionRequests() {
  }

  public record AskRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) QuestionType type,
    @Schema(description = "For matching, measuring and tentacles") String category,
    @Schema(description = "In metres, for radar, thermometer and tentacles") Integer distanceMeters
  ) {
  }

  public record AnswerRequest(
    @Schema(description = "One of the question type's choices", requiredMode = Schema.RequiredMode.REQUIRED)
    String choice,
    @Schema(description = "The place's name, for PLACE") String text
  ) {
  }
}
