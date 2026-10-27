package com.jetlag.game;

import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.session.GameEntity;
import com.jetlag.game.session.GameOutcome;
import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePlayerRepository;
import com.jetlag.game.session.GameRepository;
import com.jetlag.game.session.GameStatus;
import com.jetlag.game.template.GameTemplateEntity;
import com.jetlag.game.template.GameTemplateRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The game entities against the tables Flyway creates. Hibernate leaves those tables alone, so an entity that
 * no longer matches its migration fails here; skipped without Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class GameSchemaTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final GeometryFactory WGS84 = new GeometryFactory(new PrecisionModel(), 4326);

  @Autowired
  private GameTemplateRepository templates;

  @Autowired
  private GameRepository games;

  @Autowired
  private GamePlayerRepository players;

  @Autowired
  private EntityManager entityManager;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @Test
  void storesTemplatesGamesAndPlayers() {
    RouteSnapshot route = new RouteSnapshot("r1", "6", "Västtrafik", "900");
    GameTemplateEntity template = new GameTemplateEntity("Göteborg", box(11.9, 57.6, 12.1, 57.8),
      AccessTokens.issue().hash());
    template.setRoutes(Set.of(route));
    template.setSettings(Map.of("hidingMinutes", 45));
    templates.save(template);

    GameEntity game = games.save(new GameEntity(template.getId(), "ABC234", template.getName(), 30,
      template.getBoundary(), template.getSettings(), template.getRoutes()));
    AccessTokens.IssuedToken token = AccessTokens.issue();
    players.save(new GamePlayerEntity(game, "Ada", true, token.hash()));
    entityManager.flush();
    entityManager.clear();

    GameTemplateEntity storedTemplate = templates.findById(template.getId()).orElseThrow();
    assertThat(storedTemplate.getRoutes()).containsExactly(route);
    assertThat(storedTemplate.getSettings()).containsEntry("hidingMinutes", 45);
    assertThat(storedTemplate.getBoundary().equalsExact(template.getBoundary())).isTrue();
    assertThat(storedTemplate.getCreatedAt()).isNotNull();

    assertThat(games.findByInviteCodeAndStatusNot("ABC234", GameStatus.FINISHED)).get()
      .satisfies(stored -> {
        assertThat(stored.getStatus()).isEqualTo(GameStatus.LOBBY);
        assertThat(stored.getRoutes()).containsExactly(route);
      });

    GamePlayerEntity player = players.findByTokenHash(AccessTokens.hash(token.token())).orElseThrow();
    assertThat(player.getDisplayName()).isEqualTo("Ada");
    assertThat(player.getGame().getId()).isEqualTo(game.getId());
    assertThat(player.getRole()).isNull();
  }

  @Test
  void invitesCodesAreReusableOnlyOnceTheGameIsFinished() {
    GameEntity finished = games.save(new GameEntity(null, "SAME22", "Same", 30, box(0, 0, 1, 1), Map.of(), Set.of()));
    entityManager.flush();
    finished.finish(Instant.now(), GameOutcome.ENDED);
    entityManager.flush();
    games.save(new GameEntity(null, "SAME22", "Same", 30, box(0, 0, 1, 1), Map.of(), Set.of()));
    entityManager.flush();

    assertThatThrownBy(() -> games.saveAndFlush(new GameEntity(null, "SAME22", "Same", 30, box(0, 0, 1, 1), Map.of(), Set.of())))
      .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void leavesGameTablesToFlyway() {
    assertThat(jdbcTemplate.queryForObject(
      "SELECT count(*) FROM flyway_schema_history WHERE version = '1' AND success", Integer.class)).isEqualTo(1);
    // Hibernate would have created this column as varchar(255); the migration says text
    assertThat(jdbcTemplate.queryForObject("""
      SELECT data_type FROM information_schema.columns WHERE table_name = 'game_template' AND column_name = 'name'
      """, String.class)).isEqualTo("text");
  }

  private static Polygon box(double west, double south, double east, double north) {
    return WGS84.createPolygon(new Coordinate[]{
      new Coordinate(west, south), new Coordinate(east, south), new Coordinate(east, north),
      new Coordinate(west, north), new Coordinate(west, south)
    });
  }
}
