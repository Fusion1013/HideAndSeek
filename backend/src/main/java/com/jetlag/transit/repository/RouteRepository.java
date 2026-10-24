package com.jetlag.transit.repository;

import com.jetlag.transit.model.RouteEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface RouteRepository extends GtfsRepository<RouteEntity, String> {

  /**
   * Ids of the routes with a trip calling at any stop within the bounds, in one query. Reads the precomputed
   * gtfs_route_stops view rather than every stop time, so large areas are as quick as small ones.
   */
  @Query(value = """
        SELECT DISTINCT route_stop.route_id
        FROM gtfs_route_stops route_stop
        JOIN gtfs_stops stop ON stop.stop_id = route_stop.stop_id
        WHERE stop.stop_lat BETWEEN :minLatitude AND :maxLatitude
          AND stop.stop_lon BETWEEN :minLongitude AND :maxLongitude
        ORDER BY route_stop.route_id
        """, nativeQuery = true)
  List<String> findRouteIdsServingStopsWithinBounds(
    @Param("minLatitude") double minLatitude,
    @Param("maxLatitude") double maxLatitude,
    @Param("minLongitude") double minLongitude,
    @Param("maxLongitude") double maxLongitude);

  @Modifying
  @Query("""
        DELETE FROM RouteEntity route
        WHERE route.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
