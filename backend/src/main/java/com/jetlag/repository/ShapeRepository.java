package com.jetlag.repository;

import com.jetlag.domain.ShapeEntity;
import com.jetlag.domain.StopEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShapeRepository extends JpaRepository<ShapeEntity, String> {

  @Modifying
  @Query("""
        DELETE FROM ShapeEntity shape
        WHERE shape.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

  List<ShapeEntity> findByShapeId(String shapeId);

  List<ShapeEntity> findByShapeIdIn(List<String> shapeIds);

}
