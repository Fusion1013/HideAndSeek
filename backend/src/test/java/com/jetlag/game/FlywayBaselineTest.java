package com.jetlag.game;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A database from before Flyway already has the GTFS tables but no migration history. With the settings in
 * application.yml it is baselined below V1, so the game tables are still created; skipped without Docker.
 */
@Testcontainers(disabledWithoutDocker = true)
class FlywayBaselineTest {

  @Container
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  @Test
  void migratesADatabaseThatAlreadyHasTables() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
      POSTGIS.getJdbcUrl(), POSTGIS.getUsername(), POSTGIS.getPassword());
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("CREATE TABLE gtfs_agency (agency_id varchar(255) PRIMARY KEY)");

    Flyway.configure()
      .dataSource(dataSource)
      .baselineOnMigrate(true)
      .baselineVersion("0")
      .load()
      .migrate();

    assertThat(jdbc.queryForObject("SELECT to_regclass('public.game_player') IS NOT NULL", Boolean.class)).isTrue();
    assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history ORDER BY installed_rank", String.class))
      .startsWith("0", "1");
  }
}
