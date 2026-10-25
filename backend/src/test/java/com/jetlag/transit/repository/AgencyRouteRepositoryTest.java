package com.jetlag.transit.repository;

import com.jetlag.transit.model.AgencyRouteEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

/** Runs against a new PostGIS database in Docker, set up only by the application; skipped without Docker. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class AgencyRouteRepositoryTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  @Autowired
  private AgencyRouteRepository agencyRoutes;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @Test
  void joinsRoutesToTheirAgencyWithoutAnyTableOfItsOwn() {
    jdbcTemplate.update("INSERT INTO gtfs_agency (agency_id, agency_name, import_generation) VALUES ('vt', 'Västtrafik', 'g')");
    jdbcTemplate.update("""
      INSERT INTO gtfs_routes (route_id, agency_id, route_short_name, route_type, import_generation)
      VALUES ('r1', 'vt', '6', '900', 'g'), ('r2', 'vt', '16', '700', 'g'), ('orphan', 'none', '1', '700', 'g')
      """);

    assertThat(agencyRoutes.findAll()).extracting(AgencyRouteEntity::getRouteId).containsExactlyInAnyOrder("r1", "r2");
    assertThat(agencyRoutes.findById("r1")).get().extracting(AgencyRouteEntity::getAgencyName).isEqualTo("Västtrafik");
    assertThat(agencyRoutes.findByRouteType("700")).extracting(AgencyRouteEntity::getRouteId).containsExactly("r2");
    assertThat(jdbcTemplate.queryForObject("SELECT to_regclass('public.gtfs_agency_routes') IS NULL", Boolean.class))
      .isTrue();
  }
}
