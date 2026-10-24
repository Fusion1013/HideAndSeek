package com.jetlag.transit.gtfs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Moves shapes from the old gtfs_shapes table (one row per point) into gtfs_shape_lines (one line per shape),
 * then drops the old table, which alone took over 13 GB. Does nothing once the old table is gone.
 * <p>
 * If the conversion fails, typically because the disk is already full, the old table is dropped anyway:
 * the shapes come back with the next GTFS import, and the space is needed for that import to succeed.
 */
@Component
class ShapeLinesMigration {

  private static final Logger logger = LoggerFactory.getLogger(ShapeLinesMigration.class);

  private final JdbcTemplate jdbcTemplate;

  ShapeLinesMigration(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @EventListener(ApplicationReadyEvent.class)
  void migrate() {
    Boolean oldTableExists = jdbcTemplate.queryForObject(
      "SELECT to_regclass('public.gtfs_shapes') IS NOT NULL", Boolean.class);
    if (!Boolean.TRUE.equals(oldTableExists)) return;

    logger.info("Converting GTFS shape points into lines; this can take a few minutes");
    try {
      int lines = jdbcTemplate.update("""
        INSERT INTO gtfs_shape_lines (shape_id, geometry, import_generation)
        SELECT shape_id,
               ST_SetSRID(ST_MakeLine(ST_MakePoint(shape_pt_lon, shape_pt_lat) ORDER BY shape_pt_sequence), 4326),
               max(import_generation)
        FROM gtfs_shapes
        WHERE NOT (shape_pt_lat = 0 AND shape_pt_lon = 0)
        GROUP BY shape_id
        HAVING count(*) >= 2
        ON CONFLICT (shape_id) DO NOTHING
        """);
      logger.info("Converted {} GTFS shapes into lines", lines);
    } catch (RuntimeException e) {
      logger.warn("Could not convert the GTFS shape points; they return with the next GTFS import", e);
    }
    jdbcTemplate.execute("DROP TABLE gtfs_shapes");
    logger.info("Dropped the old gtfs_shapes table");
  }
}
