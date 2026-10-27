package com.jetlag.game.timeline;

import com.jetlag.game.session.GameDTO;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/** A finished game from start to end, for its replay: where everyone went, and what happened when. */
public record GameTimelineDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) GameDTO game,
  @Schema(description = "Each player's positions, seekers' and hiders'; players who shared none are left out",
    requiredMode = Schema.RequiredMode.REQUIRED)
  List<PlayerTrackDTO> tracks,
  @Schema(description = "What happened, oldest first", requiredMode = Schema.RequiredMode.REQUIRED)
  List<TimelineEventDTO> events
) {
}
