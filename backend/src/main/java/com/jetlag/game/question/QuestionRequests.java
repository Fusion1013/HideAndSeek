package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/** What players send to ask and answer questions. */
public final class QuestionRequests {

  private QuestionRequests() {
  }

  public record AskRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) QuestionType type,
    @Schema(description = "For matching, measuring, tentacles and photo") String category,
    @Schema(description = "In metres, for radar and tentacles") Integer distanceMeters,
    @Schema(description = "Where the seekers started moving, for thermometer") QuestionParams.Position start,
    @Schema(description = "Where the seekers stopped moving, for thermometer") QuestionParams.Position end,
    @Schema(description = "The question in the seekers' own words, for custom",
      maxLength = QuestionParams.MAX_TEXT_LENGTH) String text
  ) {

    public AskRequest(QuestionType type, String category, Integer distanceMeters, QuestionParams.Position start,
                      QuestionParams.Position end) {
      this(type, category, distanceMeters, start, end, null);
    }
  }

  public record AnswerRequest(
    @Schema(description = "One of the question type's choices", requiredMode = Schema.RequiredMode.REQUIRED)
    String choice,
    @Schema(description = "The place's name, for PLACE") String text
  ) {
  }
}
