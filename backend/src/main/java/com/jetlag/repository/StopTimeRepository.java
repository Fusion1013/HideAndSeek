package com.jetlag.repository;

import com.jetlag.domain.StopTimeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StopTimeRepository extends JpaRepository<StopTimeEntity, String> {

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
