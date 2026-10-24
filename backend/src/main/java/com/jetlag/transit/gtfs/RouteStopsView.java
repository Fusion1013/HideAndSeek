package com.jetlag.transit.gtfs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * gtfs_route_stops: which routes serve each stop, precomputed from the stop times (about 10 million rows)
 * into one row per stop and route (about 200 thousand). "Which routes run here" for a map area then only
 * reads the stops in it, however large the area. Rebuilt after each GTFS import.
 */
@Component
class RouteStopsView {

  private static final Logger logger = LoggerFactory.getLogger(RouteStopsView.class);

  private final JdbcTemplate jdbcTemplate;

  RouteStopsView(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /** Creates the view on first start; Hibernate's schema update does not manage views. */
  @EventListener(ApplicationReadyEvent.class)
  void create() {
    try {
      jdbcTemplate.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS gtfs_route_stops AS
        SELECT DISTINCT stop_time.stop_id, trip.route_id
        FROM gtfs_stop_times stop_time
        JOIN gtfs_trips trip ON trip.trip_id = stop_time.trip_id
        WHERE stop_time.stop_id IS NOT NULL
        """);
      // Unique, so the view can be refreshed without blocking readers; stop_id first, for lookups by stop
      jdbcTemplate.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS gtfs_route_stops_stop_route ON gtfs_route_stops (stop_id, route_id)");
    } catch (RuntimeException e) {
      logger.warn("Could not create the gtfs_route_stops view", e);
    }
  }

  /** Brings the view up to date with newly imported stop times and trips. */
  void refresh() {
    jdbcTemplate.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY gtfs_route_stops");
  }
}
