package com.jetlag.game.events;

import com.jetlag.game.session.PlayerRole;

/** Who may see an event. */
public enum EventAudience {
  ALL,
  SEEKERS,
  HIDERS;

  /** Whether a player with this role (null: none yet) may see the event. */
  public boolean includes(PlayerRole role) {
    return switch (this) {
      case ALL -> true;
      case SEEKERS -> role == PlayerRole.SEEKER;
      case HIDERS -> role == PlayerRole.HIDER;
    };
  }
}
