package com.jetlag.game.question;

import com.jetlag.game.session.GameStations;
import com.jetlag.game.session.StationDTO;
import com.jetlag.places.model.OverpassLocationCategory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Finds the place of a question's category nearest to a position, among the game's stations or the imported places.
 * Lines are measured to their closest point, as the Distances tab does. Kept with the question, so what it says
 * does not change with the next import.
 */
@Service
public class NearestPlaces {

  private static final String GAME_STATIONS = "game_station";
  /** The frontend's category IDs. Anything else has no places to find. */
  private static final Map<String, OverpassLocationCategory> CATEGORIES = Map.ofEntries(
    Map.entry("rail_station", OverpassLocationCategory.RAIL_STATION),
    Map.entry("high_speed_rail", OverpassLocationCategory.HIGH_SPEED_RAIL_LINE),
    Map.entry("airports", OverpassLocationCategory.COMMERCIAL_AIRPORT),
    Map.entry("parks", OverpassLocationCategory.PARK),
    Map.entry("museums", OverpassLocationCategory.MUSEUM),
    Map.entry("libraries", OverpassLocationCategory.LIBRARY),
    Map.entry("hospitals", OverpassLocationCategory.HOSPITAL),
    Map.entry("movie_theatres", OverpassLocationCategory.MOVIE_THEATRE),
    Map.entry("zoos", OverpassLocationCategory.ZOO),
    Map.entry("aquariums", OverpassLocationCategory.AQUARIUM),
    Map.entry("golf_courses", OverpassLocationCategory.GOLF_COURSE),
    Map.entry("mountains", OverpassLocationCategory.MOUNTAIN),
    Map.entry("foreign_consulates", OverpassLocationCategory.FOREIGN_CONSULATE));
  /** In degrees: about 50 m, plenty for shading a cell, and it keeps questions small. */
  private static final double CELL_TOLERANCE = 0.0005;
  /** SWEREF 99 TM, as the places' cells are built in; see OverpassVoronoiService. */
  private static final int PROJECTED_SRID = 3006;
  /** How far the outermost stations' cells reach; as for the places' cells. */
  private static final int CELL_MARGIN_METERS = 20_000;
  /** Segments per quarter of a circle; with the tolerance, enough to look round and keep questions small. */
  private static final int REACH_QUADRANT_SEGMENTS = 6;
  private static final int REACH_TOLERANCE_METERS = 50;
  private static final String STATION_SITES = "SELECT location AS shape FROM game_station WHERE game_id = ?";
  private static final String PLACE_SITES = """
    SELECT COALESCE(g.geometry, ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)) AS shape
    FROM overpass_location l
    LEFT JOIN overpass_geometry g ON g.overpass_location_id = l.id
    WHERE l.category = ?
    """;

  private final GameStations stations;
  private final JdbcTemplate jdbcTemplate;

  public NearestPlaces(GameStations stations, JdbcTemplate jdbcTemplate) {
    this.stations = stations;
    this.jdbcTemplate = jdbcTemplate;
  }

  /** The nearest place of the category, if the category has any. */
  public Optional<QuestionParams.NearestPlace> nearest(UUID gameId, String category, QuestionParams.Position from) {
    return find(gameId, category, from, null);
  }

  /** The nearest place of the category with this name, ignoring case. */
  public Optional<QuestionParams.NearestPlace> named(UUID gameId, String category, QuestionParams.Position from, String name) {
    return find(gameId, category, from, name);
  }

  /**
   * The part of the play area within this distance of any place of the category. Being closer to one's nearest
   * place than the seekers were can mean any of them, not only the seekers' own.
   *
   * @return GeoJSON; null if there is no such distance or no such place
   */
  public String reach(UUID gameId, String category, int meters) {
    boolean ownStations = GAME_STATIONS.equals(category);
    OverpassLocationCategory places = CATEGORIES.get(category);
    if (meters <= 0 || (!ownStations && places == null)) return null;
    return jdbcTemplate.query("""
        WITH play_area AS (
          SELECT ST_Transform(boundary, %1$d) AS shape FROM game WHERE id = ?
        ), sites AS (
          %2$s
        ), discs AS (
          SELECT ST_Union(ST_Buffer(ST_Transform(sites.shape, %1$d), ?, %3$d)) AS shape
          FROM sites CROSS JOIN play_area
          WHERE ST_DWithin(ST_Transform(sites.shape, %1$d), play_area.shape, ?)
        )
        SELECT ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(
          ST_CollectionExtract(ST_Intersection(discs.shape, play_area.shape), 3), %4$d), 4326), 6)
        FROM discs CROSS JOIN play_area
        WHERE discs.shape IS NOT NULL
        """.formatted(PROJECTED_SRID, ownStations ? STATION_SITES : PLACE_SITES, REACH_QUADRANT_SEGMENTS, REACH_TOLERANCE_METERS),
      (row, index) -> row.getString(1),
      gameId, ownStations ? gameId : places.name(), meters, meters).stream().findFirst().orElse(null);
  }

  private Optional<QuestionParams.NearestPlace> find(UUID gameId, String category, QuestionParams.Position from, String name) {
    if (GAME_STATIONS.equals(category)) return findStation(gameId, from, name);
    OverpassLocationCategory places = CATEGORIES.get(category);
    if (places == null) return Optional.empty();
    List<QuestionParams.NearestPlace> found = jdbcTemplate.query("""
        WITH origin AS (SELECT ST_SetSRID(ST_MakePoint(?, ?), 4326) AS point)
        SELECT l.name, ST_X(nearest.point) AS longitude, ST_Y(nearest.point) AS latitude,
          ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geometry, ?), 6) AS cell
        FROM overpass_location l
        CROSS JOIN origin
        LEFT JOIN overpass_geometry g ON g.overpass_location_id = l.id
        LEFT JOIN overpass_voronoi_cell c ON c.overpass_location_id = l.id
        CROSS JOIN LATERAL (
          SELECT COALESCE(ST_ClosestPoint(g.geometry, origin.point),
            ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)) AS point
        ) nearest
        WHERE l.category = ? AND (?::text IS NULL OR lower(l.name) = lower(?))
        ORDER BY ST_Distance(nearest.point::geography, origin.point::geography)
        LIMIT 1
        """,
      (row, index) -> {
        QuestionParams.Position position = new QuestionParams.Position(row.getDouble("longitude"), row.getDouble("latitude"));
        return new QuestionParams.NearestPlace(row.getString("name"), position.longitude(), position.latitude(),
          from.metersTo(position), row.getString("cell"), null);
      },
      from.longitude(), from.latitude(), CELL_TOLERANCE, places.name(), name, name);
    return found.stream().findFirst();
  }

  private Optional<QuestionParams.NearestPlace> findStation(UUID gameId, QuestionParams.Position from, String name) {
    return stations.list(gameId).stream()
      .filter(station -> name == null || station.name().equalsIgnoreCase(name))
      .min(Comparator.comparingInt(station -> from.metersTo(position(station))))
      .map(station -> new QuestionParams.NearestPlace(station.name(), station.longitude(), station.latitude(),
        from.metersTo(position(station)), stationCell(gameId, station), null));
  }

  private static QuestionParams.Position position(StationDTO station) {
    return new QuestionParams.Position(station.longitude(), station.latitude());
  }

  /** The area where this is the game's closest station; null for a game of one station. */
  private String stationCell(UUID gameId, StationDTO station) {
    return jdbcTemplate.query("""
        WITH sites AS (
          SELECT ST_Transform(location, %1$d) AS point FROM game_station WHERE game_id = ?
        ), cells AS (
          SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(point), 0, ST_Expand(ST_Extent(point)::geometry, %2$d)))).geom AS cell
          FROM sites
        )
        SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(cell, %1$d), 4326), 6)
        FROM cells
        WHERE ST_Contains(ST_SetSRID(cell, %1$d), ST_Transform(ST_SetSRID(ST_MakePoint(?, ?), 4326), %1$d))
        """.formatted(PROJECTED_SRID, CELL_MARGIN_METERS),
      (row, index) -> row.getString(1), gameId, station.longitude(), station.latitude()).stream().findFirst().orElse(null);
  }
}
