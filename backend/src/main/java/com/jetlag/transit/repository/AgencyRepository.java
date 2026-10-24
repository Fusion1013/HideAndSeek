package com.jetlag.transit.repository;

import com.jetlag.transit.model.AgencyEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AgencyRepository extends GtfsRepository<AgencyEntity, String> {

  List<AgencyEntity> findByAgencyId(String agencyId);

  @Modifying
  @Query("""
        DELETE FROM AgencyEntity agency
        WHERE agency.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
