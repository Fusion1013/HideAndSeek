package com.jetlag.game.events;

import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePlayerRepository;
import com.jetlag.game.session.PlayerRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The open event streams, by game. Pushes each event to the game's players once the change that recorded it has
 * committed, to those its audience includes, and sends a heartbeat now and then so proxies keep idle streams open
 * and players can correct their clocks. Kept in memory: one backend instance holds every stream.
 */
@Component
public class GameEventBroadcaster {

  private static final Logger logger = LoggerFactory.getLogger(GameEventBroadcaster.class);
  static final long HEARTBEAT_MS = 20_000;

  private final Map<UUID, Set<Subscriber>> subscribersByGame = new ConcurrentHashMap<>();
  private final GamePlayerRepository playerRepository;
  private final Clock clock;

  public GameEventBroadcaster(GamePlayerRepository playerRepository, Clock clock) {
    this.playerRepository = playerRepository;
    this.clock = clock;
  }

  /**
   * Adds a stream. Events are held back until {@link Subscriber#ready} is called, after the snapshot or replay
   * has been sent, so none arrives before the state it applies to.
   */
  public Subscriber subscribe(UUID gameId, UUID playerId, SseEmitter emitter) {
    Subscriber subscriber = new Subscriber(gameId, playerId, emitter);
    subscribersByGame.computeIfAbsent(gameId, id -> ConcurrentHashMap.newKeySet()).add(subscriber);
    emitter.onCompletion(() -> remove(subscriber));
    emitter.onTimeout(() -> remove(subscriber));
    emitter.onError(error -> remove(subscriber));
    return subscriber;
  }

  /** How many streams are open for the game; for tests and diagnostics. */
  public int subscriberCount(UUID gameId) {
    return subscribersByGame.getOrDefault(gameId, Set.of()).size();
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void broadcast(GameEvent event) {
    Set<Subscriber> subscribers = subscribersByGame.get(event.gameId());
    if (subscribers == null || subscribers.isEmpty()) return;

    // Roles can change in the lobby, so they are read when the event is sent, not when the stream opened
    Map<UUID, PlayerRole> roles = event.audience() == EventAudience.ALL ? Map.of() : rolesOf(event.gameId());
    for (Subscriber subscriber : subscribers) {
      if (event.audience() == EventAudience.ALL || event.audience().includes(roles.get(subscriber.playerId))) {
        subscriber.push(event);
      }
    }
  }

  @Scheduled(fixedRate = HEARTBEAT_MS, initialDelay = HEARTBEAT_MS)
  public void heartbeat() {
    String data = "{\"serverTime\":\"" + clock.instant() + "\"}";
    subscribersByGame.values().forEach(subscribers -> subscribers.forEach(subscriber -> subscriber.heartbeat(data)));
  }

  private Map<UUID, PlayerRole> rolesOf(UUID gameId) {
    Map<UUID, PlayerRole> roles = new HashMap<>();
    for (GamePlayerEntity player : playerRepository.findByGameIdOrderByJoinedAt(gameId)) {
      roles.put(player.getId(), player.getRole());
    }
    return roles;
  }

  private void remove(Subscriber subscriber) {
    subscribersByGame.computeIfPresent(subscriber.gameId, (id, subscribers) -> {
      subscribers.remove(subscriber);
      return subscribers.isEmpty() ? null : subscribers;
    });
  }

  /** One player's open stream. Sends are serialized: an emitter must not be written to by two threads at once. */
  public final class Subscriber {
    private final UUID gameId;
    private final UUID playerId;
    private final SseEmitter emitter;
    /** Events that arrived before the snapshot or replay was sent; null once ready. */
    private List<GameEvent> held = new ArrayList<>();
    /** The last event sent; later ones with a lower or equal ID are already part of what the player has. */
    private long lastSentId;
    private boolean closed;

    private Subscriber(UUID gameId, UUID playerId, SseEmitter emitter) {
      this.gameId = gameId;
      this.playerId = playerId;
      this.emitter = emitter;
    }

    /** Sends an event (snapshot or replayed) before the stream goes live. */
    public synchronized void send(long id, String type, String data) {
      if (send(SseEmitter.event().id(Long.toString(id)).name(type).data(data))) lastSentId = Math.max(lastSentId, id);
    }

    /** Ends the catch-up: sends what arrived meanwhile and from now on sends events as they come. */
    public synchronized void ready() {
      List<GameEvent> pending = held;
      held = null;
      pending.forEach(this::push);
    }

    private synchronized void push(GameEvent event) {
      if (held != null) {
        held.add(event);
      } else if (event.id() > lastSentId) {
        send(event.id(), event.type(), event.payload());
      }
    }

    private synchronized void heartbeat(String data) {
      if (held == null) send(SseEmitter.event().name("heartbeat").data(data));
    }

    private boolean send(SseEmitter.SseEventBuilder event) {
      if (closed) return false;
      try {
        emitter.send(event);
        return true;
      } catch (IOException | IllegalStateException e) {
        // The player went away (closed the page, lost the connection)
        logger.debug("Dropping stream of player {}: {}", playerId, e.getMessage());
        closed = true;
        remove(this);
        emitter.completeWithError(e);
        return false;
      }
    }
  }
}
