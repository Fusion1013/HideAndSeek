package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/** The hiders' answer: one of the question type's choices, with a place's name for {@link #PLACE}. */
public record QuestionAnswer(
  @Schema(description = "YES, NO, CLOSER, FURTHER, HOTTER, COLDER, PLACE or NONE, as the question type allows",
    requiredMode = Schema.RequiredMode.REQUIRED)
  String choice,
  @Schema(description = "The place's name, for PLACE") String text
) {
  public static final String YES = "YES";
  public static final String NO = "NO";
  public static final String CLOSER = "CLOSER";
  public static final String FURTHER = "FURTHER";
  public static final String HOTTER = "HOTTER";
  public static final String COLDER = "COLDER";
  public static final String PLACE = "PLACE";
  public static final String NONE = "NONE";
  public static final int MAX_TEXT_LENGTH = 100;
}
