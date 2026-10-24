package com.jetlag.transit.repository;

import com.jetlag.transit.model.StopTimeEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StopTimeRepository extends GtfsRepository<StopTimeEntity, String> {

  List<StopTimeEntity> findByStopId(String stopId);

  List<StopTimeEntity> findByStopIdIn(List<String> stopIds);

  List<StopTimeEntity> findByTripIdIn(List<String> tripIds);

  @Modifying
  @Query("""
        DELETE FROM StopTimeEntity stopTime
        WHERE stopTime.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
