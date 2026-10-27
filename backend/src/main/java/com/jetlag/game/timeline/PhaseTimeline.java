package com.jetlag.game.timeline;

import com.jetlag.game.session.GameDTO;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** The game's phases: the hiders setting off, the seekers setting off, the end. */
@Component
class PhaseTimeline implements TimelineSource {

  @Override
  public List<TimelineEventDTO> events(GameDTO game) {
    List<TimelineEventDTO> events = new ArrayList<>();
    if (game.hidingStartedAt() != null) {
      events.add(TimelineEventDTO.of(TimelineEventType.HIDING_STARTED, game.hidingStartedAt(), null));
    }
    if (game.seekingStartedAt() != null) {
      events.add(TimelineEventDTO.of(TimelineEventType.SEEKING_STARTED, game.seekingStartedAt(), null));
    }
    if (game.finishedAt() != null) {
      events.add(TimelineEventDTO.of(TimelineEventType.GAME_ENDED, game.finishedAt(), null));
    }
    return events;
  }
}
