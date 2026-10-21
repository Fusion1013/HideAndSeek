package com.jetlag.repository;

import com.jetlag.domain.RouteEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RouteRepository extends JpaRepository<RouteEntity, String> {

  @Modifying
  @Query("""
        DELETE FROM RouteEntity route
        WHERE route.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
