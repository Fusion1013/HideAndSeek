package com.jetlag.transit.repository;

import com.jetlag.transit.model.TripEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TripRepository extends GtfsRepository<TripEntity, String> {

  @Modifying
  @Query("""
        DELETE FROM TripEntity trip
        WHERE trip.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

  List<TripEntity> findByRouteId(String routeId);

}
