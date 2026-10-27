package com.jetlag.game.session;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Moving games on to their next phase when its time comes, in the database itself. */
@Repository
public class GamePhases {

  private final JdbcTemplate jdbcTemplate;

  public GamePhases(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /**
   * Moves every game whose hiding time is up on to SEEKING, as of the moment the time ran out, and returns
   * their IDs. A conditional update, so two callers at the same time cannot both move the same game.
   */
  public List<UUID> startSeekingWhereHidingIsOver(Instant now) {
    return jdbcTemplate.queryForList("""
        UPDATE game SET status = 'SEEKING', seeking_started_at = hiding_ends_at, version = version + 1
        WHERE status = 'HIDING' AND hiding_ends_at <= ?
        RETURNING id
        """, UUID.class, Timestamp.from(now));
  }

  /**
   * Games not finished in which nothing has happened since {@code cutoff}: no event, or (before the first) not
   * created since.
   */
  public List<UUID> idleSince(Instant cutoff) {
    return jdbcTemplate.queryForList("""
        SELECT game.id FROM game
        WHERE game.status <> 'FINISHED'
          AND COALESCE((SELECT max(event.created_at) FROM game_event event WHERE event.game_id = game.id), game.created_at) < ?
        """, UUID.class, Timestamp.from(cutoff));
  }

  /** Deletes the events of these types from finished games; returns how many. */
  public int trimFinished(List<String> eventTypes) {
    return jdbcTemplate.update("""
        DELETE FROM game_event event USING game
        WHERE game.id = event.game_id AND game.status = 'FINISHED' AND event.type = ANY (?)
        """, (Object) eventTypes.toArray(String[]::new));
  }

  /**
   * Deletes the games that finished before {@code cutoff}, with everything that belongs to them: players and
   * their positions and tracks, stations, hiding spot, questions and events. Returns how many games were deleted.
   */
  public int deleteFinishedBefore(Instant cutoff) {
    return jdbcTemplate.update("DELETE FROM game WHERE status = 'FINISHED' AND finished_at < ?", Timestamp.from(cutoff));
  }
}
