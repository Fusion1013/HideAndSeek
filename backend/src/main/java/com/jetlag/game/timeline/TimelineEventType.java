package com.jetlag.game.timeline;

/**
 * What happened at a moment of a game's timeline. New kinds of event are added here, with a {@link TimelineSource}
 * that finds them; the order here breaks ties between events at the same moment.
 */
public enum TimelineEventType {
  /** The host started the game: the hiders set off. */
  HIDING_STARTED,
  /** A hider chose the hiders' station, or changed it; {@code hidingStation} says which. */
  HIDING_STATION_CHOSEN,
  /** The hiding time was up and the seekers set off. */
  SEEKING_STARTED,
  /** A seeker asked a question; {@code question} is the question as it ended up. */
  QUESTION_ASKED,
  /** The hiders answered a question; {@code question} has the answer. */
  QUESTION_ANSWERED,
  /** The hiders did not answer a question in time. */
  QUESTION_EXPIRED,
  /** The game ended; the game's outcome says how. */
  GAME_ENDED
}
