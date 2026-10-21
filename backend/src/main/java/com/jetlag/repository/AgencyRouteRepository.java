package com.jetlag.repository;

import com.jetlag.domain.AgencyRouteEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AgencyRouteRepository
  extends JpaRepository<AgencyRouteEntity, String> {

  List<AgencyRouteEntity> findByAgencyId(String agencyId);

  List<AgencyRouteEntity> findByRouteType(String routeType);

  List<AgencyRouteEntity> findByAgencyIdAndRouteType(
    String agencyId,
    String routeType
  );
}
