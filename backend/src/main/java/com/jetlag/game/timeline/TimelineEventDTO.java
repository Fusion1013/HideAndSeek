package com.jetlag.game.timeline;

import com.jetlag.game.question.QuestionDTO;
import com.jetlag.game.session.HidingStationDTO;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/**
 * One moment of a finished game. Which of the optional fields are set depends on the type; a new kind of event
 * that needs more than these adds a field of its own.
 */
public record TimelineEventDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) TimelineEventType type,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant at,
  @Schema(description = "The player who did it, if it was someone") UUID playerId,
  @Schema(description = "For the question events: the question, as it was at the end of the game")
  QuestionDTO question,
  @Schema(description = "For HIDING_STATION_CHOSEN: the station chosen") HidingStationDTO hidingStation
) {

  public static TimelineEventDTO of(TimelineEventType type, Instant at, UUID playerId) {
    return new TimelineEventDTO(type, at, playerId, null, null);
  }

  public static TimelineEventDTO of(TimelineEventType type, Instant at, UUID playerId, QuestionDTO question) {
    return new TimelineEventDTO(type, at, playerId, question, null);
  }

  public static TimelineEventDTO of(HidingStationDTO hidingStation) {
    return new TimelineEventDTO(TimelineEventType.HIDING_STATION_CHOSEN, hidingStation.chosenAt(),
      hidingStation.chosenBy(), null, hidingStation);
  }
}
