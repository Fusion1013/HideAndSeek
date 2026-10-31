package com.jetlag.game.question;

import java.util.Set;

/**
 * The kinds of question the seekers may ask, after the game's rules: what each needs to be asked and how the
 * hiders may answer it. The wording is the frontend's.
 */
public enum QuestionType {
  /** Is your nearest (category) the same as ours? */
  MATCHING(true, false, false, Set.of(QuestionAnswer.YES, QuestionAnswer.NO)),
  /** Compared to us, are you closer to or further from your nearest (category)? */
  MEASURING(true, false, false, Set.of(QuestionAnswer.CLOSER, QuestionAnswer.FURTHER)),
  /** Are you within (distance) of us? */
  RADAR(false, true, false, Set.of(QuestionAnswer.YES, QuestionAnswer.NO)),
  /** We moved from here to there: are we hotter or colder? Its distance is the one between the two. */
  THERMOMETER(false, false, true, Set.of(QuestionAnswer.HOTTER, QuestionAnswer.COLDER)),
  /** Of the (category) within (distance) of us, which are you nearest? Answered with a place's name, or none. */
  TENTACLES(true, true, false, Set.of(QuestionAnswer.PLACE, QuestionAnswer.NONE)),
  /** Send us a photo of (subject). Its subjects are the frontend's categories, and it is answered with the picture. */
  PHOTO(true, false, false, Set.of(QuestionAnswer.PHOTO));

  private final boolean needsCategory;
  private final boolean needsDistance;
  private final boolean needsPath;
  private final Set<String> choices;

  QuestionType(boolean needsCategory, boolean needsDistance, boolean needsPath, Set<String> choices) {
    this.needsCategory = needsCategory;
    this.needsDistance = needsDistance;
    this.needsPath = needsPath;
    this.choices = choices;
  }

  public boolean needsCategory() {
    return needsCategory;
  }

  public boolean needsDistance() {
    return needsDistance;
  }

  /** Whether it compares the place nearest the seekers with the one nearest the hiders. */
  public boolean comparesNearest() {
    return this == MATCHING || this == MEASURING;
  }

  /** Whether it is about a start and an end point. */
  public boolean needsPath() {
    return needsPath;
  }

  /** The answers the hiders may give. */
  public Set<String> choices() {
    return choices;
  }
}
