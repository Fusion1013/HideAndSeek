package com.jetlag.game.timeline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.game.events.GameEvent;
import com.jetlag.game.events.GameEventLog;
import com.jetlag.game.session.GameDTO;
import com.jetlag.game.session.GamePlayService;
import com.jetlag.game.session.HidingStationDTO;
import org.springframework.stereotype.Component;

import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Every station the hiders chose, including the ones they changed their minds about: the game keeps only the
 * last, but each choice was recorded as an event for the hiders.
 */
@Component
class HidingStationTimeline implements TimelineSource {

  private final GameEventLog eventLog;
  private final ObjectMapper objectMapper;

  HidingStationTimeline(GameEventLog eventLog, ObjectMapper objectMapper) {
    this.eventLog = eventLog;
    this.objectMapper = objectMapper;
  }

  @Override
  public List<TimelineEventDTO> events(GameDTO game) {
    // The station is told to everyone again when the game ends: the same choice, counted once. That copy was read
    // back from the database, which keeps times to the microsecond
    Map<String, HidingStationDTO> choices = new LinkedHashMap<>();
    for (GameEvent event : eventLog.ofType(game.id(), GamePlayService.HIDING_STATION_EVENT)) {
      HidingStationDTO choice = read(event.payload());
      choices.putIfAbsent(choice.station().stationId() + "@" + choice.chosenAt().truncatedTo(ChronoUnit.MILLIS), choice);
    }
    return choices.values().stream().map(TimelineEventDTO::of).toList();
  }

  private HidingStationDTO read(String payload) {
    try {
      return objectMapper.readValue(payload, HidingStationDTO.class);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("A recorded hiding station cannot be read", e);
    }
  }
}
