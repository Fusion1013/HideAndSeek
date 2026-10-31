package com.jetlag.game.template;

import com.jetlag.game.GameSettings;
import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.auth.InvalidTokenException;
import com.jetlag.game.question.QuestionRules;
import com.jetlag.game.question.QuestionType;
import com.jetlag.game.session.GameStations;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Against a new PostGIS database in Docker; skipped without Docker. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Import({GameTemplateService.class, GameStations.class})
class GameTemplateServiceTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final List<List<Double>> BOX = List.of(
    List.of(11.9, 57.6), List.of(12.1, 57.6), List.of(12.1, 57.8), List.of(11.9, 57.8));

  @Autowired
  private GameTemplateService templates;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @BeforeEach
  void addRoutes() {
    jdbcTemplate.update("INSERT INTO gtfs_agency (agency_id, agency_name, import_generation) VALUES ('vt', 'Västtrafik', 'g')");
    jdbcTemplate.update("""
      INSERT INTO gtfs_routes (route_id, agency_id, route_short_name, route_type, import_generation)
      VALUES ('r6', 'vt', '6', '900', 'g'), ('r16', 'vt', '16', '700', 'g')
      """);
  }

  @Test
  void createsATemplateWithRouteNamesAndAnOwnerToken() {
    CreatedTemplateDTO created = templates.create(new TemplateRequest("  Göteborg ", BOX, List.of("r6", "r16", "r6"), null));

    TemplateDTO template = created.template();
    assertThat(template.name()).isEqualTo("Göteborg");
    assertThat(template.boundary()).hasSize(5);
    assertThat(template.routes()).extracting(TemplateDTO.TemplateRouteDTO::routeId).containsExactly("r16", "r6");
    assertThat(template.routes()).allSatisfy(route -> {
      assertThat(route.agencyName()).isEqualTo("Västtrafik");
      assertThat(route.available()).isTrue();
    });
    assertThat(created.ownerToken()).isNotBlank();
    assertThat(templates.get(template.id())).isEqualTo(template);
  }

  @Test
  void onlyTheOwnerTokenChangesOrDeletesATemplate() {
    CreatedTemplateDTO created = templates.create(new TemplateRequest("Göteborg", BOX, List.of("r6"), null));
    UUID id = created.template().id();
    TemplateRequest change = new TemplateRequest("Centrum", BOX, List.of("r16"), null);

    assertThatThrownBy(() -> templates.update(id, null, change)).isInstanceOf(InvalidTokenException.class);
    assertStatus(() -> templates.update(id, AccessTokens.issue().token(), change), HttpStatus.FORBIDDEN);
    assertStatus(() -> templates.delete(id, AccessTokens.issue().token()), HttpStatus.FORBIDDEN);

    TemplateDTO updated = templates.update(id, created.ownerToken(), change);
    assertThat(updated.name()).isEqualTo("Centrum");
    assertThat(updated.routes()).extracting(TemplateDTO.TemplateRouteDTO::routeId).containsExactly("r16");

    templates.delete(id, created.ownerToken());
    assertStatus(() -> templates.get(id), HttpStatus.NOT_FOUND);
  }

  @Test
  void keepsARouteThatAnImportRemovedButRejectsNewUnknownRoutes() {
    CreatedTemplateDTO created = templates.create(new TemplateRequest("Göteborg", BOX, List.of("r6", "r16"), null));
    UUID id = created.template().id();
    jdbcTemplate.update("DELETE FROM gtfs_routes WHERE route_id = 'r6'");

    TemplateDTO afterImport = templates.get(id);
    assertThat(afterImport.routes()).filteredOn(route -> route.routeId().equals("r6")).singleElement()
      .satisfies(route -> {
        assertThat(route.available()).isFalse();
        assertThat(route.routeShortName()).isEqualTo("6");
      });

    TemplateDTO renamed = templates.update(id, created.ownerToken(), new TemplateRequest("Renamed", BOX, List.of("r6", "r16"), null));
    assertThat(renamed.routes()).extracting(TemplateDTO.TemplateRouteDTO::routeId).containsExactly("r16", "r6");

    assertStatus(() -> templates.create(new TemplateRequest("New", BOX, List.of("r6"), null)), HttpStatus.BAD_REQUEST);
  }

  @Test
  void rejectsMissingNames() {
    assertStatus(() -> templates.create(new TemplateRequest(" ", BOX, List.of(), null)), HttpStatus.BAD_REQUEST);
    assertStatus(() -> templates.create(new TemplateRequest("x".repeat(101), BOX, List.of(), null)), HttpStatus.BAD_REQUEST);
  }

  @Test
  void keepsWhatDiffersFromTheDefaultsAndNothingElse() {
    CreatedTemplateDTO created = templates.create(new TemplateRequest("Göteborg", BOX, List.of(), null));
    assertThat(created.template().settings()).isEqualTo(GameSettings.DEFAULTS);
    assertThat(created.template().settings().rules(QuestionType.RADAR).answerTime()).isEqualTo(Duration.ofMinutes(5));

    QuestionRules radar = new QuestionRules(false, 10, List.of(), List.of(500));
    GameSettings settings = new GameSettings(Map.of("RADAR", radar, "GONE", QuestionRules.DEFAULTS));
    TemplateDTO updated = templates.update(created.template().id(), created.ownerToken(),
      new TemplateRequest("Göteborg", BOX, List.of(), settings));

    assertThat(updated.settings()).isEqualTo(new GameSettings(Map.of("RADAR", radar)));
    assertThat(templates.get(updated.id()).settings().rules(QuestionType.RADAR).answerTime()).isEqualTo(Duration.ofMinutes(10));
    assertThat(updated.settings().rules(QuestionType.TENTACLES)).isEqualTo(QuestionRules.DEFAULTS);
  }

  @Test
  void readsSettingsItDoesNotKnowOrThatWereNeverSet() {
    UUID id = templates.create(new TemplateRequest("Göteborg", BOX, List.of(), null)).template().id();
    jdbcTemplate.update("UPDATE game_template SET settings = '{\"hidingMinutes\": 45}' WHERE id = ?", id);
    assertThat(templates.get(id).settings()).isEqualTo(GameSettings.DEFAULTS);
  }

  @Test
  void rejectsSettingsThatCannotBePlayed() {
    Map<String, QuestionRules> noneLeft = Arrays.stream(QuestionType.values())
      .collect(Collectors.toMap(QuestionType::name, type -> new QuestionRules(true, null, List.of(), List.of())));

    for (GameSettings settings : List.of(
      new GameSettings(noneLeft),
      new GameSettings(Map.of("RADAR", new QuestionRules(false, 0, List.of(), List.of()))),
      new GameSettings(Map.of("RADAR", new QuestionRules(false, 121, List.of(), List.of()))),
      new GameSettings(Map.of("MATCHING", new QuestionRules(false, null, List.of("Bad!"), List.of()))),
      new GameSettings(Map.of("RADAR", new QuestionRules(false, null, List.of(), List.of(1)))))) {
      assertStatus(() -> templates.create(new TemplateRequest("Göteborg", BOX, List.of(), settings)), HttpStatus.BAD_REQUEST);
    }
  }

  @Test
  void listsOnlyExistingTemplatesInTheOrderAsked() {
    UUID first = templates.create(new TemplateRequest("First", BOX, List.of(), null)).template().id();
    UUID second = templates.create(new TemplateRequest("Second", BOX, List.of(), null)).template().id();

    assertThat(templates.list(List.of(second, UUID.randomUUID(), first)))
      .extracting(TemplateDTO::name).containsExactly("Second", "First");
  }

  private static void assertStatus(Runnable action, HttpStatus status) {
    assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
      exception -> assertThat(exception.getStatusCode()).isEqualTo(status));
  }
}
