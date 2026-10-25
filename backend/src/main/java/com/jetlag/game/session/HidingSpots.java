package com.jetlag.game.session;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The game_hiding_spot table. Read only to answer hiders: nothing that builds what every player sees may use it.
 */
@Repository
public class HidingSpots {

  private final JdbcTemplate jdbcTemplate;

  public HidingSpots(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<HidingStationDTO> find(UUID gameId) {
    return jdbcTemplate.query("""
        SELECT spot.chosen_by, spot.chosen_at, station.station_id, station.name,
               ST_X(station.location) AS longitude, ST_Y(station.location) AS latitude
        FROM game_hiding_spot spot
        JOIN game_station station ON station.game_id = spot.game_id AND station.station_id = spot.station_id
        WHERE spot.game_id = ?
        """,
      (row, index) -> new HidingStationDTO(
        new StationDTO(row.getString("station_id"), row.getString("name"), row.getDouble("longitude"),
          row.getDouble("latitude")),
        row.getObject("chosen_by", UUID.class), row.getTimestamp("chosen_at").toInstant()),
      gameId).stream().findFirst();
  }

  /** Sets the game's hiding station, replacing an earlier choice. */
  public void choose(UUID gameId, String stationId, UUID playerId, Instant at) {
    jdbcTemplate.update("""
        INSERT INTO game_hiding_spot (game_id, station_id, chosen_by, chosen_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (game_id) DO UPDATE
        SET station_id = excluded.station_id, chosen_by = excluded.chosen_by, chosen_at = excluded.chosen_at
        """, gameId, stationId, playerId, Timestamp.from(at));
  }
}
