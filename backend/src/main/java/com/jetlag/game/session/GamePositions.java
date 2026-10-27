package com.jetlag.game.session;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The game_position table: every position the players reported while the game ran. Hiders report too, so it must
 * never be read for a game that is not finished.
 */
@Repository
public class GamePositions {

  /** One reported position. */
  public record Position(UUID playerId, double longitude, double latitude, Float accuracyMeters, Instant recordedAt) {
  }

  private final JdbcTemplate jdbcTemplate;

  public GamePositions(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void record(UUID gameId, UUID playerId, double longitude, double latitude, Float accuracyMeters, Instant at) {
    jdbcTemplate.update("""
        INSERT INTO game_position (game_id, player_id, location, accuracy_m, recorded_at)
        VALUES (?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?)
        """, gameId, playerId, longitude, latitude, accuracyMeters, Timestamp.from(at));
  }

  /** The game's positions, by player and then oldest first. */
  public List<Position> list(UUID gameId) {
    return jdbcTemplate.query("""
        SELECT player_id, ST_X(location) AS longitude, ST_Y(location) AS latitude, accuracy_m, recorded_at
        FROM game_position WHERE game_id = ? ORDER BY player_id, recorded_at, id
        """,
      (row, index) -> new Position(row.getObject("player_id", UUID.class), row.getDouble("longitude"),
        row.getDouble("latitude"), row.getObject("accuracy_m", Float.class), row.getTimestamp("recorded_at").toInstant()),
      gameId);
  }
}
