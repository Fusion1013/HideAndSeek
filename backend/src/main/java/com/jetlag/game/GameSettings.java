package com.jetlag.game;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.jetlag.game.question.QuestionRules;
import com.jetlag.game.question.QuestionType;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Map;

/**
 * The rules a template sets for its games, which each game copies. Whatever is left out is as usual, so a kind of
 * question added later needs nothing here and is available in every template and game that already exists.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GameSettings(
  // By name rather than QuestionType, so stored settings can still be read after a kind of question goes away
  @Schema(description = "By question type, for the kinds of question that differ from the usual",
    requiredMode = Schema.RequiredMode.REQUIRED)
  Map<String, QuestionRules> questions,
  @Schema(description = "Leaves out stations with a longer wait for an arrival or departure during the day, on the "
    + "template's routes; every station counts if not set",
    minimum = "" + GameSettings.MIN_STATION_GAP_MINUTES, maximum = "" + GameSettings.MAX_STATION_GAP_MINUTES)
  Integer maxStationGapMinutes
) {
  public static final int MIN_STATION_GAP_MINUTES = 1;
  public static final int MAX_STATION_GAP_MINUTES = 240;
  public static final GameSettings DEFAULTS = new GameSettings(Map.of());

  public GameSettings {
    questions = questions == null ? Map.of() : Map.copyOf(questions);
  }

  public GameSettings(Map<String, QuestionRules> questions) {
    this(questions, null);
  }

  public QuestionRules rules(QuestionType type) {
    return questions.getOrDefault(type.name(), QuestionRules.DEFAULTS);
  }
}
