package com.jetlag.game.timeline;

import com.jetlag.game.session.GameDTO;

import java.util.List;

/**
 * Finds one kind of thing that happened in a finished game. Every bean that implements this adds to the timeline,
 * so a new feature joins it with a source of its own (and its own {@link TimelineEventType}s).
 */
public interface TimelineSource {

  /** The events of this kind in the game, in any order. Only asked about finished games. */
  List<TimelineEventDTO> events(GameDTO game);
}
