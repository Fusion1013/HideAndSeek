package com.jetlag.game.question;

import java.util.Set;

/**
 * The kinds of question the seekers may ask, after the game's rules: what each needs to be asked and how the
 * hiders may answer it. The wording is the frontend's.
 */
public enum QuestionType {
  /** Is your nearest (category) the same as ours? */
  MATCHING(true, false, Set.of(QuestionAnswer.YES, QuestionAnswer.NO)),
  /** Compared to us, are you closer to or further from your nearest (category)? */
  MEASURING(true, false, Set.of(QuestionAnswer.CLOSER, QuestionAnswer.FURTHER)),
  /** Are you within (distance) of us? */
  RADAR(false, true, Set.of(QuestionAnswer.YES, QuestionAnswer.NO)),
  /** We moved (distance): are we hotter or colder? */
  THERMOMETER(false, true, Set.of(QuestionAnswer.HOTTER, QuestionAnswer.COLDER)),
  /** Of the (category) within (distance) of us, which are you nearest? Answered with a place's name, or none. */
  TENTACLES(true, true, Set.of(QuestionAnswer.PLACE, QuestionAnswer.NONE));

  private final boolean needsCategory;
  private final boolean needsDistance;
  private final Set<String> choices;

  QuestionType(boolean needsCategory, boolean needsDistance, Set<String> choices) {
    this.needsCategory = needsCategory;
    this.needsDistance = needsDistance;
    this.choices = choices;
  }

  public boolean needsCategory() {
    return needsCategory;
  }

  public boolean needsDistance() {
    return needsDistance;
  }

  /** The answers the hiders may give. */
  public Set<String> choices() {
    return choices;
  }
}
