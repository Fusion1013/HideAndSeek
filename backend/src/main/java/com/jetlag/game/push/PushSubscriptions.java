package com.jetlag.game.push;

import com.jetlag.game.events.EventAudience;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The game_push_subscription table: where each player's notifications go. */
@Repository
public class PushSubscriptions {

  /** A player's subscription, with the keys to encrypt for it (base64url, as the browser gives them). */
  record Subscription(UUID playerId, String endpoint, String p256dh, String auth) {
  }

  private final JdbcTemplate jdbcTemplate;

  public PushSubscriptions(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  Optional<String> endpointOf(UUID playerId) {
    return jdbcTemplate.queryForList("SELECT endpoint FROM game_push_subscription WHERE player_id = ?",
      String.class, playerId).stream().findFirst();
  }

  /** Sets the player's subscription, replacing the one they had. */
  void save(UUID playerId, String endpoint, String p256dh, String auth, Instant at) {
    jdbcTemplate.update("""
        INSERT INTO game_push_subscription (player_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (player_id) DO UPDATE
        SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at
        """, playerId, endpoint, p256dh, auth, Timestamp.from(at));
  }

  void delete(UUID playerId) {
    jdbcTemplate.update("DELETE FROM game_push_subscription WHERE player_id = ?", playerId);
  }

  /** Removes a subscription the push service no longer knows, unless the player has since sent a new one. */
  void deleteGone(UUID playerId, String endpoint) {
    jdbcTemplate.update("DELETE FROM game_push_subscription WHERE player_id = ? AND endpoint = ?", playerId, endpoint);
  }

  /** The subscriptions of the game's players the audience includes, but not of {@code except} (may be null). */
  List<Subscription> of(UUID gameId, EventAudience audience, UUID except) {
    String role = switch (audience) {
      case ALL -> null;
      case SEEKERS -> "SEEKER";
      case HIDERS -> "HIDER";
    };
    return jdbcTemplate.query("""
        SELECT subscription.player_id, subscription.endpoint, subscription.p256dh, subscription.auth
        FROM game_push_subscription subscription
        JOIN game_player player ON player.id = subscription.player_id
        WHERE player.game_id = ? AND (?::text IS NULL OR player.role = ?) AND player.id IS DISTINCT FROM ?
        """,
      (row, index) -> new Subscription(row.getObject("player_id", UUID.class), row.getString("endpoint"),
        row.getString("p256dh"), row.getString("auth")),
      gameId, role, role, except);
  }
}
