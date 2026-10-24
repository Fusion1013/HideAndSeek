package com.jetlag.transit.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;

/**
 * Questions about whole sets of routes, answered in one query each so a large selection (thousands of routes,
 * tens of thousands of shapes) needs neither every stop time nor one request per route. Ids are passed as
 * one array parameter: PostgreSQL allows at most 65 535 parameters per statement, fewer than there are shapes.
 */
@Repository
public class RouteNetworkQueries {

  /** One of a route's shapes. */
  public record RouteShape(String routeId, String shapeId) {}

  /** A shape as a GeoJSON LineString geometry, simplified. */
  public record ShapeLine(String shapeId, String geoJson) {}

  private final JdbcTemplate jdbcTemplate;

  public RouteNetworkQueries(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /** Every stop where a trip of one of the routes calls, from the precomputed gtfs_route_stops. */
  public List<String> stopIdsServedBy(Collection<String> routeIds) {
    if (routeIds.isEmpty()) return List.of();
    return jdbcTemplate.query(
      connection -> withIds(connection, """
        SELECT DISTINCT stop_id FROM gtfs_route_stops WHERE route_id = ANY(?) ORDER BY stop_id
        """, routeIds),
      (row, index) -> row.getString("stop_id"));
  }

  /** The distinct shapes the routes' trips follow. */
  public List<RouteShape> shapesOf(Collection<String> routeIds) {
    if (routeIds.isEmpty()) return List.of();
    return jdbcTemplate.query(
      connection -> withIds(connection, """
        SELECT DISTINCT route_id, shape_id FROM gtfs_trips
        WHERE route_id = ANY(?) AND shape_id IS NOT NULL
        ORDER BY route_id, shape_id
        """, routeIds),
      (row, index) -> new RouteShape(row.getString("route_id"), row.getString("shape_id")));
  }

  /**
   * The shapes as lines, simplified so that no point moves more than {@code tolerance} degrees. Simplifying
   * to about a screen pixel keeps the look and cuts the size many times over.
   */
  public List<ShapeLine> simplifiedLines(Collection<String> shapeIds, double tolerance) {
    if (shapeIds.isEmpty()) return List.of();
    return jdbcTemplate.query(
      connection -> {
        PreparedStatement statement = withIds(connection, """
          SELECT shape_id, ST_AsGeoJSON(ST_Simplify(geometry, ?), 6) AS geo_json
          FROM gtfs_shape_lines
          WHERE shape_id = ANY(?)
          """, shapeIds, 2);
        statement.setDouble(1, Math.max(tolerance, 0));
        return statement;
      },
      (row, index) -> new ShapeLine(row.getString("shape_id"), row.getString("geo_json")));
  }

  private static PreparedStatement withIds(Connection connection, String sql, Collection<String> ids) throws SQLException {
    return withIds(connection, sql, ids, 1);
  }

  private static PreparedStatement withIds(Connection connection, String sql, Collection<String> ids, int parameterIndex)
    throws SQLException {
    PreparedStatement statement = connection.prepareStatement(sql);
    Array array = connection.createArrayOf("text", ids.toArray());
    statement.setArray(parameterIndex, array);
    return statement;
  }
}
