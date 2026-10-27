package com.jetlag.game.session;

/** How a finished game ended. */
public enum GameOutcome {
  /** The seekers found the hiders. */
  FOUND,
  /** The host ended it. */
  ENDED,
  /** Nobody played it for too long, and it was ended for them. */
  ABANDONED
}
