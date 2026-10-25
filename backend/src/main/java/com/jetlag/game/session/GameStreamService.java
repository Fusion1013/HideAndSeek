package com.jetlag.game.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.game.events.GameEvent;
import com.jetlag.game.events.GameEventBroadcaster;
import com.jetlag.game.events.GameEventLog;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

/**
 * Opens a player's event stream. A new stream starts with a {@value #SNAPSHOT_EVENT} of the game; a stream that
 * reconnects with the ID of the last event it saw gets the events it missed instead, as long as there are not too
 * many. After that, events come as they happen.
 */
@Service
public class GameStreamService {

  /** The whole game as the player sees it, as a {@link PlayerGameDTO}; its ID is the latest event it includes. */
  public static final String SNAPSHOT_EVENT = "snapshot";
  /** A stream ends after this long and the client opens a new one, so no connection lives for ever. */
  static final long STREAM_TIMEOUT_MS = 30 * 60 * 1000;
  /** Beyond this many missed events, a snapshot is shorter than the replay. */
  static final int MAX_REPLAY = 200;

  private final GameService gameService;
  private final GameEventLog eventLog;
  private final GameEventBroadcaster broadcaster;
  private final GamePlayerRepository playerRepository;
  private final ObjectMapper objectMapper;

  public GameStreamService(GameService gameService, GameEventLog eventLog, GameEventBroadcaster broadcaster,
                           GamePlayerRepository playerRepository, ObjectMapper objectMapper) {
    this.gameService = gameService;
    this.eventLog = eventLog;
    this.broadcaster = broadcaster;
    this.playerRepository = playerRepository;
    this.objectMapper = objectMapper;
  }

  /** {@code lastEventId}: from the Last-Event-ID header of a reconnecting stream; null for a new one. */
  public SseEmitter open(GamePlayerEntity player, Long lastEventId) {
    UUID gameId = player.getGame().getId();
    SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
    // Subscribed first, holding back live events, so none is lost between the catch-up and going live
    GameEventBroadcaster.Subscriber subscriber = broadcaster.subscribe(gameId, player.getId(), emitter);

    // An ID ahead of the log (say, from before the database was reset) cannot be caught up from
    boolean canReplay = lastEventId != null && lastEventId <= eventLog.latestId(gameId);
    List<GameEvent> missed = canReplay ? eventLog.after(gameId, lastEventId, MAX_REPLAY + 1) : null;
    if (missed != null && missed.size() <= MAX_REPLAY) {
      PlayerRole role = playerRepository.findById(player.getId()).map(GamePlayerEntity::getRole).orElse(null);
      missed.stream()
        .filter(event -> event.audience().includes(role))
        .forEach(event -> subscriber.send(event.id(), event.type(), event.payload()));
      // Tells the client how far it is now, also when it missed nothing it may see
      if (!missed.isEmpty()) subscriber.send(missed.getLast().id(), "caught-up", "{}");
    } else {
      // Read before the state: an event recorded in between is then sent again, never lost
      long latestId = eventLog.latestId(gameId);
      subscriber.send(latestId, SNAPSHOT_EVENT, json(gameService.get(player)));
    }
    subscriber.ready();
    return emitter;
  }

  private String json(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Snapshot cannot be written as JSON", e);
    }
  }
}
