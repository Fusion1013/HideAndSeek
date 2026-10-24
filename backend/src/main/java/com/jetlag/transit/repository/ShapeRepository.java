package com.jetlag.transit.repository;

import com.jetlag.transit.model.ShapeEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShapeRepository extends GtfsRepository<ShapeEntity, String> {

  @Modifying
  @Query("""
        DELETE FROM ShapeEntity shape
        WHERE shape.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

  List<ShapeEntity> findByShapeIdIn(List<String> shapeIds);

}
