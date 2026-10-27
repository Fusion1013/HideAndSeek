package com.jetlag.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Creates the spatial index that Hibernate's schema update cannot express (it only creates B-tree indexes).
 * Without it, every map-view query on overpass_geometry scans the whole table.
 */
@Component
public class SpatialIndexInitializer {

  private static final Logger logger = LoggerFactory.getLogger(SpatialIndexInitializer.class);

  private final JdbcTemplate jdbcTemplate;

  public SpatialIndexInitializer(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void createSpatialIndexes() {
    try {
      jdbcTemplate.execute(
        "CREATE INDEX IF NOT EXISTS overpass_geometry_geometry_gist ON overpass_geometry USING GIST (geometry)");
    } catch (RuntimeException e) {
      logger.warn("Could not create the spatial index on overpass_geometry", e);
    }
    try {
      jdbcTemplate.execute(
        "CREATE INDEX IF NOT EXISTS overpass_voronoi_cell_geometry_gist ON overpass_voronoi_cell USING GIST (geometry)");
    } catch (RuntimeException e) {
      logger.warn("Could not create the spatial index on overpass_voronoi_cell", e);
    }
  }
}
