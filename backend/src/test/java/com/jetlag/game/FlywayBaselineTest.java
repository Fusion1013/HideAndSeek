package com.jetlag.game;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
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

  /** Each test starts from an empty database: they share the container. */
  @BeforeEach
  void emptyDatabase() {
    new JdbcTemplate(new DriverManagerDataSource(POSTGIS.getJdbcUrl(), POSTGIS.getUsername(), POSTGIS.getPassword()))
      .execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  }

  @Test
  void givesGamesFinishedBeforeOutcomesWereRecordedOne() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
      POSTGIS.getJdbcUrl(), POSTGIS.getUsername(), POSTGIS.getPassword());
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    Flyway.configure().dataSource(dataSource).baselineOnMigrate(true).baselineVersion("0").target("5").load().migrate();
    jdbc.update("""
      INSERT INTO game (id, invite_code, name, hiding_minutes, status, boundary, finished_at)
      VALUES (gen_random_uuid(), 'OLD234', 'Old', 30, 'FINISHED', ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326), now()),
             (gen_random_uuid(), 'RUN234', 'Running', 30, 'LOBBY', ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326), NULL)
      """);

    Flyway.configure().dataSource(dataSource).baselineOnMigrate(true).baselineVersion("0").load().migrate();

    assertThat(jdbc.queryForList("SELECT name || '=' || COALESCE(outcome, '-') FROM game ORDER BY name", String.class))
      .containsExactly("Old=ENDED", "Running=-");
  }

  @Test
  void keepsTheSeekersPositionsRecordedBeforeTracksWere() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
      POSTGIS.getJdbcUrl(), POSTGIS.getUsername(), POSTGIS.getPassword());
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    Flyway.configure().dataSource(dataSource).baselineOnMigrate(true).baselineVersion("0").target("6").load().migrate();
    jdbc.update("""
      INSERT INTO game (id, invite_code, name, hiding_minutes, status, boundary)
      VALUES ('00000000-0000-0000-0000-000000000001', 'OLD234', 'Old', 30, 'SEEKING',
              ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326));
      INSERT INTO game_player (id, game_id, display_name, role, is_host, token_hash, joined_at)
      VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Ada', 'SEEKER', true,
              '\\x01', now());
      INSERT INTO game_event (game_id, type, audience, payload) VALUES
        ('00000000-0000-0000-0000-000000000001', 'seeker-location', 'HIDERS',
         '{"playerId":"00000000-0000-0000-0000-000000000002","longitude":11.97,"latitude":57.7,"accuracyMeters":12.0,"recordedAt":"2026-10-25T12:00:00Z"}');
      """);

    Flyway.configure().dataSource(dataSource).baselineOnMigrate(true).baselineVersion("0").load().migrate();

    assertThat(jdbc.queryForList("SELECT ST_X(location) || ',' || ST_Y(location) || ',' || accuracy_m FROM game_position",
      String.class)).containsExactly("11.97,57.7,12");
  }

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
