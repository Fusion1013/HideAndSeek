package com.jetlag.game.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;
import java.util.UUID;

/** The game_event table: recording events as part of a change, and reading them back for a replay. */
@Repository
public class GameEventLog {

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final ApplicationEventPublisher publisher;
  private final Clock clock;

  public GameEventLog(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, ApplicationEventPublisher publisher,
                      Clock clock) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.publisher = publisher;
    this.clock = clock;
  }

  /**
   * Records an event in the caller's transaction; it reaches the players only if that transaction commits.
   * The payload is serialized the way the REST endpoints serialize their responses.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public GameEvent record(UUID gameId, String type, EventAudience audience, Object payload) {
    String json;
    try {
      json = objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("Event payload cannot be written as JSON", e);
    }
    // The application's clock, like every other time in a game, so a game's last activity is comparable with them
    Long id = jdbcTemplate.queryForObject(
      "INSERT INTO game_event (game_id, type, audience, payload, created_at) VALUES (?, ?, ?, ?::jsonb, ?) RETURNING id",
      Long.class, gameId, type, audience.name(), json, Timestamp.from(clock.instant()));
    GameEvent event = new GameEvent(id == null ? 0 : id, gameId, type, audience, json);
    publisher.publishEvent(event);
    return event;
  }

  /** The game's events after the given one, oldest first, at most {@code limit}. */
  public List<GameEvent> after(UUID gameId, long afterId, int limit) {
    return jdbcTemplate.query("""
        SELECT id, game_id, type, audience, payload::text AS payload FROM game_event
        WHERE game_id = ? AND id > ? ORDER BY id LIMIT ?
        """,
      (row, index) -> new GameEvent(row.getLong("id"), row.getObject("game_id", UUID.class), row.getString("type"),
        EventAudience.valueOf(row.getString("audience")), row.getString("payload")),
      gameId, afterId, limit);
  }

  /** The ID of the game's latest event; 0 before the first. */
  public long latestId(UUID gameId) {
    Long id = jdbcTemplate.queryForObject("SELECT COALESCE(max(id), 0) FROM game_event WHERE game_id = ?", Long.class, gameId);
    return id == null ? 0 : id;
  }
}
