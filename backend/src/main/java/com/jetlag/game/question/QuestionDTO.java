package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** A question and its answer, as every player of the game sees it. */
public record QuestionDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) QuestionType type,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) QuestionParams params,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) GameQuestionEntity.Status status,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID askedBy,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant askedAt,
  @Schema(description = "The hiders must answer by then", requiredMode = Schema.RequiredMode.REQUIRED)
  Instant deadlineAt,
  QuestionAnswer answer,
  UUID answeredBy,
  Instant answeredAt
) {
  public static QuestionDTO from(GameQuestionEntity question) {
    return new QuestionDTO(question.getId(), question.getType(), question.getParams(), question.getStatus(),
      question.getAskedBy(), question.getAskedAt(), question.getDeadlineAt(), question.getAnswer(),
      question.getAnsweredBy(), question.getAnsweredAt());
  }
}
