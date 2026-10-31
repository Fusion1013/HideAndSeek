package com.jetlag.game.question;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The hiders' answer: one of the question type's choices, with a place's name for {@link #PLACE}. The picture of a
 * {@link #PHOTO} is kept apart, as a {@link GameQuestionPhotoEntity}.
 */
public record QuestionAnswer(
  @Schema(description = "YES, NO, CLOSER, FURTHER, HOTTER, COLDER, PLACE, NONE or PHOTO, as the question type allows",
    requiredMode = Schema.RequiredMode.REQUIRED)
  String choice,
  @Schema(description = "The place's name, for PLACE") String text,
  @Schema(description = "Where the place named is; null if no place of the category has that name")
  QuestionParams.Position position
) {
  public static final String YES = "YES";
  public static final String NO = "NO";
  public static final String CLOSER = "CLOSER";
  public static final String FURTHER = "FURTHER";
  public static final String HOTTER = "HOTTER";
  public static final String COLDER = "COLDER";
  public static final String PLACE = "PLACE";
  public static final String NONE = "NONE";
  public static final String PHOTO = "PHOTO";
  public static final int MAX_TEXT_LENGTH = 100;
}
