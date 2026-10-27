package com.jetlag.places.importer;

import com.jetlag.places.model.OverpassLocationCategory;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.io.WKBWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.transaction.Transactional;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds the Voronoi cells of a point category: for each place, the area where it is the closest place of that
 * category. Runs inside the import's transaction, so the cells always match the places.
 */
@Service
class OverpassVoronoiService {

  /**
   * SWEREF 99 TM: a metric projection with little distortion across Sweden, which is all the import covers
   * (see OverpassClient). Cells built in longitude and latitude would be visibly skewed this far north.
   */
  static final int PROJECTED_SRID = 3006;

  /** How far the outermost cells reach beyond the outermost places. */
  private static final double MARGIN_METERS = 20_000;

  private static final int INSERT_BATCH_SIZE = 1000;
  private static final Logger logger = LoggerFactory.getLogger(OverpassVoronoiService.class);

  private final JdbcTemplate jdbcTemplate;
  private final GeometryFactory projected = new GeometryFactory(new PrecisionModel(), PROJECTED_SRID);

  OverpassVoronoiService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /**
   * Builds the cells of point categories that have places but no cells, such as those imported before cells
   * existed, so they need not wait for the next import. Runs whether or not the import is enabled.
   */
  @EventListener(ApplicationReadyEvent.class)
  @Transactional
  public void buildMissingCells() {
    for (OverpassLocationCategory category : OverpassLocationCategory.values()) {
      if (!category.hasVoronoiCells()) continue;
      Boolean missing = jdbcTemplate.queryForObject("""
          SELECT EXISTS (SELECT 1 FROM overpass_location WHERE category = ?)
            AND NOT EXISTS (SELECT 1 FROM overpass_voronoi_cell WHERE category = ?)
          """, Boolean.class, category.name(), category.name());
      if (Boolean.TRUE.equals(missing)) buildCells(category);
    }
  }

  /**
   * Removes the cells built for a category, and any cell of a place now in it. Must run before that category's
   * stale places are deleted, which the cells' foreign key would otherwise block.
   */
  void deleteCells(OverpassLocationCategory category) {
    jdbcTemplate.update("""
        DELETE FROM overpass_voronoi_cell
        WHERE category = ?
          OR overpass_location_id IN (SELECT id FROM overpass_location WHERE category = ?)
        """, category.name(), category.name());
  }

  /** Builds the cells of every place in the category. Expects its old cells to be deleted already. */
  int buildCells(OverpassLocationCategory category) {
    List<VoronoiCellBuilder.Site> sites = jdbcTemplate.query("""
        SELECT id, ST_X(point) AS x, ST_Y(point) AS y
        FROM (
          SELECT id, ST_Transform(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), %d) AS point
          FROM overpass_location
          WHERE category = ?
        ) projected
        """.formatted(PROJECTED_SRID),
      (row, i) -> new VoronoiCellBuilder.Site(row.getLong("id"), row.getDouble("x"), row.getDouble("y")),
      category.name());

    Map<Long, Polygon> cells = VoronoiCellBuilder.build(sites, MARGIN_METERS, projected);

    WKBWriter wkb = new WKBWriter();
    List<Object[]> rows = new ArrayList<>(cells.size());
    cells.forEach((id, cell) -> rows.add(new Object[] {id, category.name(), wkb.write(cell)}));
    String insert = """
        INSERT INTO overpass_voronoi_cell (overpass_location_id, category, geometry)
        VALUES (?, ?, ST_Transform(ST_GeomFromWKB(?, %d), 4326))
        """.formatted(PROJECTED_SRID);
    for (int i = 0; i < rows.size(); i += INSERT_BATCH_SIZE) {
      jdbcTemplate.batchUpdate(insert, rows.subList(i, Math.min(i + INSERT_BATCH_SIZE, rows.size())));
    }

    logger.info("Built {} Voronoi cells for {} places of {}", cells.size(), sites.size(), category);
    return cells.size();
  }
}
