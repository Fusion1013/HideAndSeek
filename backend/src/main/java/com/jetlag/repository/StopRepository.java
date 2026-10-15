package com.jetlag.repository;

import com.jetlag.domain.StopEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StopRepository
  extends JpaRepository<StopEntity, String> {

  List<StopEntity> findByStopNameContainingIgnoreCase(
    String stopName);

  List<StopEntity> findByParentStation(String parentStation);

  @Query("""
        SELECT stop FROM StopEntity stop
        WHERE stop.latitude BETWEEN :minLatitude AND :maxLatitude
          AND stop.longitude BETWEEN :minLongitude AND :maxLongitude
        """)
  List<StopEntity> findWithinBounds(
    @Param("minLatitude") double minLatitude,
    @Param("maxLatitude") double maxLatitude,
    @Param("minLongitude") double minLongitude,
    @Param("maxLongitude") double maxLongitude);

  @Modifying
  @Query("""
        DELETE FROM StopEntity stop
        WHERE stop.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);
}
