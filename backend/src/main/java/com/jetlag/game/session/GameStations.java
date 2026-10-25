package com.jetlag.game.session;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The stations a game is played on: copied from the GTFS data when the game is created, so a later import
 * cannot change or remove them mid-game.
 */
@Repository
public class GameStations {

  private final JdbcTemplate jdbcTemplate;

  public GameStations(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /**
   * Copies every station served by one of the routes and inside the game's area. Platforms and entrances count
   * as their parent station, which is where the station's name and position come from; a stop without a parent
   * is a station of its own. Returns how many stations were copied.
   */
  public int snapshot(UUID gameId, Collection<String> routeIds) {
    if (routeIds.isEmpty()) return 0;
    return jdbcTemplate.execute((ConnectionCallback<Integer>) connection -> {
      try (PreparedStatement statement = connection.prepareStatement("""
        INSERT INTO game_station (game_id, station_id, name, location)
        SELECT DISTINCT ON (station.stop_id)
               game.id, station.stop_id, COALESCE(NULLIF(station.stop_name, ''), station.stop_id),
               ST_SetSRID(ST_MakePoint(station.stop_lon, station.stop_lat), 4326)
        FROM game
        JOIN gtfs_route_stops route_stop ON route_stop.route_id = ANY(?)
        JOIN gtfs_stops stop ON stop.stop_id = route_stop.stop_id
        LEFT JOIN gtfs_stops parent ON parent.stop_id = stop.parent_station
        -- The parent station where there is one, else the stop itself
        JOIN gtfs_stops station ON station.stop_id = COALESCE(parent.stop_id, stop.stop_id)
        WHERE game.id = ?
          AND station.stop_lat IS NOT NULL AND station.stop_lon IS NOT NULL
          AND ST_Contains(game.boundary, ST_SetSRID(ST_MakePoint(station.stop_lon, station.stop_lat), 4326))
        ORDER BY station.stop_id
        """)) {
        Array ids = connection.createArrayOf("text", routeIds.toArray());
        statement.setArray(1, ids);
        statement.setObject(2, gameId);
        return statement.executeUpdate();
      }
    });
  }

  public int count(UUID gameId) {
    Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM game_station WHERE game_id = ?", Integer.class, gameId);
    return count == null ? 0 : count;
  }

  /** The game's stations, by name. */
  public List<StationDTO> list(UUID gameId) {
    return jdbcTemplate.query(STATION_SELECT + " WHERE game_id = ? ORDER BY name, station_id", STATION_ROW, gameId);
  }

  public Optional<StationDTO> find(UUID gameId, String stationId) {
    return jdbcTemplate.query(STATION_SELECT + " WHERE game_id = ? AND station_id = ?", STATION_ROW, gameId, stationId)
      .stream().findFirst();
  }

  private static final String STATION_SELECT =
    "SELECT station_id, name, ST_X(location) AS longitude, ST_Y(location) AS latitude FROM game_station";

  private static final RowMapper<StationDTO> STATION_ROW = (row, index) -> new StationDTO(
    row.getString("station_id"), row.getString("name"), row.getDouble("longitude"), row.getDouble("latitude"));
}
