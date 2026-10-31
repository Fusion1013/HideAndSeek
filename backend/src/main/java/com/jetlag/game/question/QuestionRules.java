package com.jetlag.game.question;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Duration;
import java.util.List;

/**
 * How a game departs from the usual for one kind of question. Only what is taken away is listed, so a category or
 * distance added later is available in every game that already exists.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record QuestionRules(
  @Schema(description = "The seekers may not ask this kind of question", requiredMode = Schema.RequiredMode.REQUIRED)
  boolean disabled,
  @Schema(description = "How long the hiders have to answer; 5 minutes if not set",
    minimum = "" + QuestionRules.MIN_ANSWER_MINUTES, maximum = "" + QuestionRules.MAX_ANSWER_MINUTES)
  Integer answerMinutes,
  @Schema(description = "The categories of place it may not be about", requiredMode = Schema.RequiredMode.REQUIRED)
  List<String> disabledCategories,
  @Schema(description = "The distances, in metres, it may not use", requiredMode = Schema.RequiredMode.REQUIRED)
  List<Integer> disabledDistances
) {
  public static final int DEFAULT_ANSWER_MINUTES = 5;
  public static final int MIN_ANSWER_MINUTES = 1;
  public static final int MAX_ANSWER_MINUTES = 120;
  /** Everything allowed, with the usual time to answer. */
  public static final QuestionRules DEFAULTS = new QuestionRules(false, null, List.of(), List.of());

  public QuestionRules {
    disabledCategories = disabledCategories == null ? List.of() : List.copyOf(disabledCategories);
    disabledDistances = disabledDistances == null ? List.of() : List.copyOf(disabledDistances);
  }

  public Duration answerTime() {
    return Duration.ofMinutes(answerMinutes == null ? DEFAULT_ANSWER_MINUTES : answerMinutes);
  }
}
