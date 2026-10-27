package com.jetlag.game.session;

import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.events.EventAudience;
import com.jetlag.game.events.GameEvent;
import com.jetlag.game.events.GameEventLog;
import com.jetlag.game.question.GameQuestionEntity;
import com.jetlag.game.question.QuestionAnswer;
import com.jetlag.game.question.QuestionDTO;
import com.jetlag.game.question.QuestionRequests;
import com.jetlag.game.question.QuestionService;
import com.jetlag.game.question.QuestionType;
import com.jetlag.game.template.GameTemplateService;
import com.jetlag.game.template.TemplateRequest;
import com.jetlag.game.timeline.GameTimelineDTO;
import com.jetlag.game.timeline.GameTimelineService;
import com.jetlag.game.timeline.PlayerTrackDTO;
import com.jetlag.game.timeline.TimelineEventDTO;
import com.jetlag.game.timeline.TimelineEventType;
import com.jetlag.game.timeline.TimelineSource;
import com.jetlag.game.timeline.TrackPointDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.json.AutoConfigureJson;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Against a new PostGIS database in Docker; skipped without Docker. */
@DataJpaTest
@AutoConfigureJson
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Import({GameService.class, GameStations.class, GamePhases.class, GameEventLog.class, PlayerViews.class,
  HidingSpots.class, GamePositions.class, GamePlayService.class, QuestionService.class, GameTemplateService.class,
  GameServiceTest.TestClock.class, GameServiceTest.Timeline.class})
class GameServiceTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final List<List<Double>> BOX = List.of(
    List.of(11.9, 57.6), List.of(12.1, 57.6), List.of(12.1, 57.8), List.of(11.9, 57.8));

  @TestConfiguration
  static class TestClock {
    @Bean
    MutableClock clock() {
      return new MutableClock(Instant.parse("2026-10-25T12:00:00Z"));
    }
  }

  /** The timeline service and every source of its events, as the application finds them. */
  @TestConfiguration
  @ComponentScan(basePackageClasses = GameTimelineService.class, useDefaultFilters = false, includeFilters =
    @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {GameTimelineService.class, TimelineSource.class}))
  static class Timeline {
  }

  /** A clock the test moves forward. */
  static class MutableClock extends Clock {
    private Instant now;

    MutableClock(Instant now) {
      this.now = now;
    }

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }

  @Autowired
  private GameService games;

  @Autowired
  private GameTemplateService templates;

  @Autowired
  private GamePlayerRepository players;

  @Autowired
  private MutableClock clock;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @Autowired
  private GameEventLog eventLog;

  @Autowired
  private GamePlayService play;

  @Autowired
  private QuestionService questions;

  @Autowired
  private GameTimelineService timelines;

  private UUID templateId;

  @BeforeEach
  void addTransitAndTemplate() {
    jdbcTemplate.update("INSERT INTO gtfs_agency (agency_id, agency_name, import_generation) VALUES ('vt', 'Västtrafik', 'g')");
    jdbcTemplate.update("""
      INSERT INTO gtfs_routes (route_id, agency_id, route_short_name, route_type, import_generation)
      VALUES ('r6', 'vt', '6', '900', 'g'), ('r16', 'vt', '16', '700', 'g')
      """);
    // A station with two platforms; a stop that is its own station; one outside the area; one on another route
    jdbcTemplate.update("""
      INSERT INTO gtfs_stops (stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, import_generation)
      VALUES ('central', 'Centralstationen', 57.70, 11.97, 1, NULL, 'g'),
             ('central-a', 'Centralstationen A', 57.701, 11.971, 0, 'central', 'g'),
             ('central-b', 'Centralstationen B', 57.702, 11.972, 0, 'central', 'g'),
             ('korsvagen', 'Korsvägen', 57.69, 11.99, 0, NULL, 'g'),
             ('far', 'Far away', 58.50, 11.00, 0, NULL, 'g'),
             ('bus-only', 'Bus stop', 57.71, 12.00, 0, NULL, 'g')
      """);
    // Created by the application at startup, which this slice of it does not run
    jdbcTemplate.execute("CREATE TABLE gtfs_route_stops (stop_id text, route_id text)");
    jdbcTemplate.update("""
      INSERT INTO gtfs_route_stops VALUES
        ('central-a', 'r6'), ('central-b', 'r6'), ('korsvagen', 'r6'), ('far', 'r6'), ('bus-only', 'r16')
      """);
    templateId = templates.create(new TemplateRequest("Göteborg", BOX, List.of("r6"))).template().id();
  }

  @Test
  void createsAGameWithItsHostAndTheStationsOfItsRoutesInsideTheArea() {
    JoinedGameDTO created = games.create(new GameRequests.CreateGameRequest(templateId, " Ada ", null));
    PlayerGameDTO view = games.get(playerOf(created));
    GameDTO game = view.game();

    assertThat(game.name()).isEqualTo("Göteborg");
    assertThat(game.status()).isEqualTo(GameStatus.LOBBY);
    assertThat(game.inviteCode()).hasSize(6).matches("[" + InviteCodes.ALPHABET + "]+");
    assertThat(game.hidingMinutes()).isEqualTo(GameService.DEFAULT_HIDING_MINUTES);
    assertThat(game.routes()).extracting(GameDTO.GameRouteDTO::routeId).containsExactly("r6");
    assertThat(game.players()).singleElement().satisfies(player -> {
      assertThat(player.displayName()).isEqualTo("Ada");
      assertThat(player.host()).isTrue();
      assertThat(player.id()).isEqualTo(created.playerId()).isEqualTo(view.myPlayerId());
    });

    assertThat(game.stationCount()).isEqualTo(2);
    assertThat(jdbcTemplate.queryForList("SELECT name FROM game_station WHERE game_id = ? ORDER BY name", String.class,
      game.id())).containsExactly("Centralstationen", "Korsvägen");
  }

  @Test
  void joinsWithTheInviteCodeAsTypedButNotWithATakenName() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    String code = games.get(playerOf(host)).game().inviteCode();
    String typed = code.substring(0, 3).toLowerCase() + "-" + code.substring(3);

    JoinedGameDTO joined = games.join(new GameRequests.JoinGameRequest(typed, "Grace"));
    assertThat(joined.gameId()).isEqualTo(host.gameId());
    assertThat(games.get(playerOf(joined)).game().players()).extracting(GameDTO.PlayerDTO::displayName)
      .containsExactly("Ada", "Grace");

    assertStatus(() -> games.join(new GameRequests.JoinGameRequest(code, "ADA")), HttpStatus.CONFLICT);
    assertStatus(() -> games.join(new GameRequests.JoinGameRequest("ZZZZZZ", "Linus")), HttpStatus.NOT_FOUND);
    assertStatus(() -> games.join(new GameRequests.JoinGameRequest(code, " ")), HttpStatus.BAD_REQUEST);
  }

  @Test
  void startsOnceRolesAreReadyAndMovesOnToSeekingWhenTheHidingTimeIsUp() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    String code = games.get(playerOf(host)).game().inviteCode();
    JoinedGameDTO grace = games.join(new GameRequests.JoinGameRequest(code, "Grace"));

    assertStatus(() -> games.start(playerOf(grace)), HttpStatus.FORBIDDEN);
    assertStatus(() -> games.start(playerOf(host)), HttpStatus.CONFLICT);
    games.setRole(playerOf(host), host.playerId(), PlayerRole.SEEKER);
    games.setRole(playerOf(host), grace.playerId(), PlayerRole.SEEKER);
    assertStatus(() -> games.start(playerOf(host)), HttpStatus.CONFLICT);
    assertStatus(() -> games.setRole(playerOf(grace), grace.playerId(), PlayerRole.HIDER), HttpStatus.FORBIDDEN);
    games.setRole(playerOf(host), grace.playerId(), PlayerRole.HIDER);

    GameDTO started = games.start(playerOf(host)).game();
    assertThat(started.status()).isEqualTo(GameStatus.HIDING);
    assertThat(started.hidingEndsAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(45)));
    assertStatus(() -> games.join(new GameRequests.JoinGameRequest(code, "Linus")), HttpStatus.CONFLICT);
    assertStatus(() -> games.setRole(playerOf(host), grace.playerId(), PlayerRole.SEEKER), HttpStatus.CONFLICT);

    clock.advance(Duration.ofMinutes(44));
    assertThat(games.get(playerOf(grace)).game().status()).isEqualTo(GameStatus.HIDING);
    clock.advance(Duration.ofMinutes(2));
    GameDTO seeking = games.get(playerOf(grace)).game();
    assertThat(seeking.status()).isEqualTo(GameStatus.SEEKING);
    assertThat(seeking.seekingStartedAt()).isEqualTo(started.hidingEndsAt());
  }

  @Test
  void endingAGameFreesItsInviteCode() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    String code = games.get(playerOf(host)).game().inviteCode();

    assertStatus(() -> games.end(playerOf(games.join(new GameRequests.JoinGameRequest(code, "Grace")))),
      HttpStatus.FORBIDDEN);
    assertThat(games.end(playerOf(host)).game().status()).isEqualTo(GameStatus.FINISHED);
    assertStatus(() -> games.join(new GameRequests.JoinGameRequest(code, "Linus")), HttpStatus.NOT_FOUND);
  }

  @Test
  void rejectsAPlayerFromAnotherGameAndBadHidingTimes() {
    JoinedGameDTO first = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    JoinedGameDTO second = games.create(new GameRequests.CreateGameRequest(templateId, "Grace", 45));

    assertStatus(() -> games.setRole(playerOf(first), second.playerId(), PlayerRole.HIDER), HttpStatus.NOT_FOUND);
    assertStatus(() -> games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 0)), HttpStatus.BAD_REQUEST);
    assertStatus(() -> games.create(new GameRequests.CreateGameRequest(UUID.randomUUID(), "Ada", 30)),
      HttpStatus.NOT_FOUND);
  }

  @Test
  void recordsTheNewStateForEveryChangeIncludingTheScheduledOne() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 1));
    String code = games.get(playerOf(host)).game().inviteCode();
    JoinedGameDTO grace = games.join(new GameRequests.JoinGameRequest(code, "Grace"));
    games.setRole(playerOf(host), host.playerId(), PlayerRole.SEEKER);
    games.setRole(playerOf(host), grace.playerId(), PlayerRole.HIDER);
    games.start(playerOf(host));
    clock.advance(Duration.ofMinutes(1));
    games.advancePhases();
    games.advancePhases();

    List<GameEvent> events = eventLog.after(host.gameId(), 0, 100);
    assertThat(events).extracting(GameEvent::type).containsOnly(GameService.GAME_EVENT);
    assertThat(events).extracting(GameEvent::audience).containsOnly(EventAudience.ALL);
    // Created, joined, two roles, started, seeking; the second scheduled run finds nothing to do
    assertThat(events).hasSize(6);
    assertThat(events.getLast().payload()).containsPattern("\"status\": ?\"SEEKING\"").doesNotContain("token");
    assertThat(events).extracting(GameEvent::id).isSorted();
    assertThat(eventLog.latestId(host.gameId())).isEqualTo(events.getLast().id());
  }

  @Test
  void hidersChooseTheirStationDuringTheHidingTimeAndOnlyTheyEverSeeIt() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    JoinedGameDTO seeker = players[0];
    JoinedGameDTO hider = players[1];
    assertStatus(() -> play.chooseHidingStation(playerOf(hider), "central"), HttpStatus.CONFLICT);

    games.start(playerOf(seeker));
    assertStatus(() -> play.chooseHidingStation(playerOf(seeker), "central"), HttpStatus.FORBIDDEN);
    assertStatus(() -> play.chooseHidingStation(playerOf(hider), "far"), HttpStatus.BAD_REQUEST);
    assertThat(play.chooseHidingStation(playerOf(hider), "central").station().name()).isEqualTo("Centralstationen");
    HidingStationDTO changed = play.chooseHidingStation(playerOf(hider), "korsvagen");

    assertThat(games.get(playerOf(hider)).hidingStation()).isEqualTo(changed);
    PlayerGameDTO seekerView = games.get(playerOf(seeker));
    assertThat(seekerView.hidingStation()).isNull();

    List<GameEvent> events = eventLog.after(seeker.gameId(), 0, 100);
    assertThat(events).filteredOn(event -> event.type().equals(GamePlayService.HIDING_STATION_EVENT))
      .hasSize(2).extracting(GameEvent::audience).containsOnly(EventAudience.HIDERS);
    assertThat(events).filteredOn(event -> event.audience() == EventAudience.ALL)
      .allSatisfy(event -> assertThat(event.payload()).doesNotContain("korsvagen").doesNotContain("Korsvägen"));

    // The time counts, even before the scheduled move to seeking has run
    clock.advance(Duration.ofMinutes(45));
    assertStatus(() -> play.chooseHidingStation(playerOf(hider), "central"), HttpStatus.CONFLICT);
  }

  @Test
  void seekersShareTheirPositionWithTheHidersOnlyAndHidersWithNobody() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    JoinedGameDTO seeker = players[0];
    JoinedGameDTO hider = players[1];
    GameRequests.LocationRequest here = new GameRequests.LocationRequest(11.97, 57.70, 12f);
    assertStatus(() -> play.reportLocation(playerOf(seeker), here), HttpStatus.CONFLICT);

    games.start(playerOf(seeker));
    // Kept for the replay, but shown to nobody while the game runs
    play.reportLocation(playerOf(hider), new GameRequests.LocationRequest(11.99, 57.69, 5f));
    assertThat(eventLog.after(seeker.gameId(), 0, 100)).noneMatch(event -> event.payload().contains("57.69"));
    assertStatus(() -> play.reportLocation(playerOf(seeker), new GameRequests.LocationRequest(200, 57.7, null)),
      HttpStatus.BAD_REQUEST);
    play.reportLocation(playerOf(seeker), here);

    assertThat(games.get(playerOf(hider)).seekerLocations()).singleElement().satisfies(location -> {
      assertThat(location.playerId()).isEqualTo(seeker.playerId());
      assertThat(location.longitude()).isEqualTo(11.97);
      assertThat(location.latitude()).isEqualTo(57.70);
      assertThat(location.accuracyMeters()).isEqualTo(12f);
    });
    assertThat(games.get(playerOf(seeker)).seekerLocations()).isEmpty();

    // Reports in quick succession are not passed on
    play.reportLocation(playerOf(seeker), new GameRequests.LocationRequest(11.98, 57.71, 8f));
    clock.advance(Duration.ofSeconds(6));
    play.reportLocation(playerOf(seeker), new GameRequests.LocationRequest(11.99, 57.72, 8f));
    List<GameEvent> locations = eventLog.after(seeker.gameId(), 0, 100).stream()
      .filter(event -> event.type().equals(GamePlayService.SEEKER_LOCATION_EVENT)).toList();
    assertThat(locations).hasSize(2).extracting(GameEvent::audience).containsOnly(EventAudience.HIDERS);
    assertThat(games.get(playerOf(hider)).seekerLocations().getFirst().longitude()).isEqualTo(11.99);

    assertThat(games.get(playerOf(seeker)).seekerLocations()).isEmpty();
    assertStatus(() -> timelines.timeline(playerOf(seeker)), HttpStatus.CONFLICT);

    games.end(playerOf(seeker));
    assertStatus(() -> play.reportLocation(playerOf(seeker), here), HttpStatus.CONFLICT);
  }

  @Test
  void aFinishedGamesTimelineHasEveryonesTracksAndWhatHappenedInOrder() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    JoinedGameDTO seeker = players[0];
    JoinedGameDTO hider = players[1];
    Instant start = clock.instant();
    games.start(playerOf(seeker));
    play.reportLocation(playerOf(hider), new GameRequests.LocationRequest(11.97, 57.70, 5f));
    play.chooseHidingStation(playerOf(hider), "central");
    clock.advance(Duration.ofMinutes(10));
    play.reportLocation(playerOf(hider), new GameRequests.LocationRequest(11.99, 57.69, 5f));
    play.chooseHidingStation(playerOf(hider), "korsvagen");
    clock.advance(Duration.ofMinutes(35));
    games.advancePhases();
    play.reportLocation(playerOf(seeker), new GameRequests.LocationRequest(11.95, 57.71, 20f));
    clock.advance(Duration.ofMinutes(2));
    QuestionDTO radar = questions.ask(playerOf(seeker), new QuestionRequests.AskRequest(QuestionType.RADAR, null, 2000));
    clock.advance(Duration.ofMinutes(1));
    questions.answer(playerOf(hider), radar.id(), new QuestionRequests.AnswerRequest("YES", null));
    clock.advance(Duration.ofMinutes(1));
    QuestionDTO matching = questions.ask(playerOf(seeker), new QuestionRequests.AskRequest(QuestionType.MATCHING, "parks", null));
    clock.advance(Duration.ofMinutes(6));
    questions.expireOverdue();
    games.found(playerOf(seeker));

    GameTimelineDTO timeline = timelines.timeline(playerOf(seeker));

    assertThat(timeline.game().outcome()).isEqualTo(GameOutcome.FOUND);
    assertThat(timeline.events()).extracting(TimelineEventDTO::type).containsExactly(
      TimelineEventType.HIDING_STARTED,
      TimelineEventType.HIDING_STATION_CHOSEN,
      TimelineEventType.HIDING_STATION_CHOSEN,
      TimelineEventType.SEEKING_STARTED,
      TimelineEventType.QUESTION_ASKED,
      TimelineEventType.QUESTION_ANSWERED,
      TimelineEventType.QUESTION_ASKED,
      TimelineEventType.QUESTION_EXPIRED,
      TimelineEventType.GAME_ENDED);
    assertThat(timeline.events().getFirst().at()).isEqualTo(start);
    assertThat(timeline.events()).filteredOn(event -> event.type() == TimelineEventType.HIDING_STATION_CHOSEN)
      .extracting(event -> event.hidingStation().station().name()).containsExactly("Centralstationen", "Korsvägen");
    assertThat(timeline.events().get(5).question().answer()).isEqualTo(new QuestionAnswer("YES", null));
    assertThat(timeline.events().get(5).playerId()).isEqualTo(hider.playerId());
    assertThat(timeline.events().get(7).question().id()).isEqualTo(matching.id());

    assertThat(timeline.tracks()).extracting(PlayerTrackDTO::playerId)
      .containsExactlyInAnyOrder(seeker.playerId(), hider.playerId());
    assertThat(timeline.tracks()).filteredOn(track -> track.playerId().equals(hider.playerId())).singleElement()
      .satisfies(track -> assertThat(track.points()).extracting(TrackPointDTO::longitude).containsExactly(11.97, 11.99));
    // The hiders see the same
    assertThat(timelines.timeline(playerOf(hider)).events()).hasSize(9);
  }

  @Test
  void keepsFinishedGamesButTrimsTheEventsOnlyNeededWhileTheyRan() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    games.start(playerOf(players[0]));
    play.reportLocation(playerOf(players[0]), new GameRequests.LocationRequest(11.97, 57.70, 10f));
    play.chooseHidingStation(playerOf(players[1]), "central");
    assertThat(games.trimFinishedGames()).isZero();
    games.end(playerOf(players[0]));

    assertThat(games.trimFinishedGames()).isEqualTo(1);
    assertThat(eventLog.after(players[0].gameId(), 0, 100)).extracting(GameEvent::type)
      .doesNotContain(GamePlayService.SEEKER_LOCATION_EVENT).contains(GamePlayService.HIDING_STATION_EVENT);
    assertThat(timelines.timeline(playerOf(players[0])).tracks()).singleElement()
      .extracting(PlayerTrackDTO::playerId).isEqualTo(players[0].playerId());
  }

  @Test
  void theSeekersFindTheHidersWhileSeekingAndEveryoneThenSeesTheStation() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    JoinedGameDTO seeker = players[0];
    JoinedGameDTO hider = players[1];
    games.start(playerOf(seeker));
    play.chooseHidingStation(playerOf(hider), "korsvagen");
    assertStatus(() -> games.found(playerOf(seeker)), HttpStatus.CONFLICT);
    assertThat(games.get(playerOf(seeker)).hidingStation()).isNull();

    clock.advance(Duration.ofMinutes(45));
    games.advancePhases();
    clock.advance(Duration.ofMinutes(72));
    assertStatus(() -> games.found(playerOf(hider)), HttpStatus.FORBIDDEN);
    GameDTO found = games.found(playerOf(seeker)).game();

    assertThat(found.status()).isEqualTo(GameStatus.FINISHED);
    assertThat(found.outcome()).isEqualTo(GameOutcome.FOUND);
    assertThat(Duration.between(found.seekingStartedAt(), found.finishedAt())).isEqualTo(Duration.ofMinutes(72));
    assertThat(games.get(playerOf(seeker)).hidingStation().station().name()).isEqualTo("Korsvägen");

    // The final state, then the station for everyone
    List<GameEvent> events = eventLog.after(seeker.gameId(), 0, 100);
    assertThat(events.get(events.size() - 2).type()).isEqualTo(GameService.GAME_EVENT);
    assertThat(events.getLast().type()).isEqualTo(GamePlayService.HIDING_STATION_EVENT);
    assertThat(events.getLast().audience()).isEqualTo(EventAudience.ALL);
    assertThat(events.subList(0, events.size() - 1)).noneMatch(event ->
      event.audience() == EventAudience.ALL && event.payload().contains("Korsvägen"));
  }

  @Test
  void recordsHowAGameEnded() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    assertThat(games.get(playerOf(host)).game().outcome()).isNull();
    assertThat(games.end(playerOf(host)).game().outcome()).isEqualTo(GameOutcome.ENDED);

    JoinedGameDTO idle = games.create(new GameRequests.CreateGameRequest(templateId, "Grace", 45));
    clock.advance(Duration.ofHours(25));
    games.finishIdleGames(Duration.ofHours(24));
    assertThat(games.get(playerOf(idle)).game().outcome()).isEqualTo(GameOutcome.ABANDONED);
  }

  @Test
  void showsATemplateTheStationsItsGamesWillHave() {
    assertThat(templates.stations(templateId)).extracting(StationDTO::name).containsExactly("Centralstationen", "Korsvägen");
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    assertThat(play.stations(playerOf(host))).isEqualTo(templates.stations(templateId));
  }

  @Test
  void listsTheGamesStationsForEveryPlayer() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    assertThat(play.stations(playerOf(host))).extracting(StationDTO::name).containsExactly("Centralstationen", "Korsvägen");
    assertThat(play.stations(playerOf(host)).getFirst().latitude()).isEqualTo(57.70);
  }

  @Test
  void seekersAskOneQuestionAtATimeWhileSeekingAndHidersAnswerIt() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    JoinedGameDTO seeker = players[0];
    JoinedGameDTO hider = players[1];
    QuestionRequests.AskRequest radar = new QuestionRequests.AskRequest(QuestionType.RADAR, null, 1000);
    games.start(playerOf(seeker));
    play.reportLocation(playerOf(seeker), new GameRequests.LocationRequest(11.97, 57.70, 10f));
    assertStatus(() -> questions.ask(playerOf(seeker), radar), HttpStatus.CONFLICT);

    clock.advance(Duration.ofMinutes(45));
    games.advancePhases();
    assertStatus(() -> questions.ask(playerOf(hider), radar), HttpStatus.FORBIDDEN);
    assertStatus(() -> questions.ask(playerOf(seeker), new QuestionRequests.AskRequest(QuestionType.RADAR, null, null)),
      HttpStatus.BAD_REQUEST);
    assertStatus(() -> questions.ask(playerOf(seeker), new QuestionRequests.AskRequest(QuestionType.MATCHING, "Bad!", null)),
      HttpStatus.BAD_REQUEST);

    QuestionDTO asked = questions.ask(playerOf(seeker), radar);
    assertThat(asked.status()).isEqualTo(GameQuestionEntity.Status.PENDING);
    assertThat(asked.params().distanceMeters()).isEqualTo(1000);
    assertThat(asked.params().category()).isNull();
    assertThat(asked.params().origin().longitude()).isEqualTo(11.97);
    assertThat(asked.deadlineAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(5)));
    assertStatus(() -> questions.ask(playerOf(seeker), radar), HttpStatus.CONFLICT);

    assertStatus(() -> questions.answer(playerOf(hider), asked.id(), new QuestionRequests.AnswerRequest("CLOSER", null)),
      HttpStatus.BAD_REQUEST);
    assertStatus(() -> questions.answer(playerOf(seeker), asked.id(), new QuestionRequests.AnswerRequest("YES", null)),
      HttpStatus.FORBIDDEN);
    QuestionDTO answered = questions.answer(playerOf(hider), asked.id(), new QuestionRequests.AnswerRequest("YES", "ignored"));
    assertThat(answered.status()).isEqualTo(GameQuestionEntity.Status.ANSWERED);
    assertThat(answered.answer()).isEqualTo(new QuestionAnswer("YES", null));
    assertThat(answered.answeredBy()).isEqualTo(hider.playerId());
    assertStatus(() -> questions.answer(playerOf(hider), asked.id(), new QuestionRequests.AnswerRequest("NO", null)),
      HttpStatus.CONFLICT);

    QuestionDTO tentacles = questions.ask(playerOf(seeker),
      new QuestionRequests.AskRequest(QuestionType.TENTACLES, "museums", 2000));
    assertStatus(() -> questions.answer(playerOf(hider), tentacles.id(), new QuestionRequests.AnswerRequest("PLACE", " ")),
      HttpStatus.BAD_REQUEST);
    assertThat(questions.answer(playerOf(hider), tentacles.id(), new QuestionRequests.AnswerRequest("PLACE", " Röhsska ")).answer())
      .isEqualTo(new QuestionAnswer("PLACE", "Röhsska"));

    // Everyone sees them, in the order asked
    assertThat(games.get(playerOf(seeker)).questions()).extracting(QuestionDTO::type)
      .containsExactly(QuestionType.RADAR, QuestionType.TENTACLES);
    assertThat(games.get(playerOf(hider)).questions()).hasSize(2);
    assertThat(eventLog.after(seeker.gameId(), 0, 100)).filteredOn(event -> event.type().equals(QuestionService.QUESTION_EVENT))
      .hasSize(4).extracting(GameEvent::audience).containsOnly(EventAudience.ALL);
  }

  @Test
  void aQuestionNotAnsweredInTimeExpires() {
    JoinedGameDTO[] players = gameWithSeekerAndHider();
    games.start(playerOf(players[0]));
    clock.advance(Duration.ofMinutes(45));
    games.advancePhases();
    QuestionDTO asked = questions.ask(playerOf(players[0]), new QuestionRequests.AskRequest(QuestionType.MATCHING, "parks", null));

    clock.advance(Duration.ofMinutes(5));
    assertStatus(() -> questions.answer(playerOf(players[1]), asked.id(), new QuestionRequests.AnswerRequest("YES", null)),
      HttpStatus.CONFLICT);
    questions.expireOverdue();

    assertThat(questions.list(players[0].gameId())).singleElement()
      .extracting(QuestionDTO::status).isEqualTo(GameQuestionEntity.Status.EXPIRED);
    // The seekers may ask again
    assertThat(questions.ask(playerOf(players[0]), new QuestionRequests.AskRequest(QuestionType.THERMOMETER, null, 1000)).status())
      .isEqualTo(GameQuestionEntity.Status.PENDING);
  }

  @Test
  void endsIdleGamesAndLaterDeletesThemWithAllTheirData() {
    JoinedGameDTO[] abandoned = gameWithSeekerAndHider();
    games.start(playerOf(abandoned[0]));
    play.reportLocation(playerOf(abandoned[0]), new GameRequests.LocationRequest(11.97, 57.70, 10f));
    clock.advance(Duration.ofHours(20));
    JoinedGameDTO active = games.create(new GameRequests.CreateGameRequest(templateId, "Linus", 30));
    clock.advance(Duration.ofHours(5));

    // Abandoned 25 hours ago (its hiding time long over); the other game has seen something in the last 5 hours
    assertThat(games.finishIdleGames(Duration.ofHours(24))).isEqualTo(1);
    assertThat(games.get(playerOf(abandoned[1])).game().status()).isEqualTo(GameStatus.FINISHED);
    assertThat(games.get(playerOf(active)).game().status()).isEqualTo(GameStatus.LOBBY);
    assertThat(eventLog.after(abandoned[0].gameId(), 0, 100).getLast().payload()).contains("FINISHED");
    assertThat(games.finishIdleGames(Duration.ofHours(24))).isZero();

    UUID gameId = abandoned[0].gameId();
    clock.advance(Duration.ofDays(6));
    assertThat(games.deleteFinishedGames(Duration.ofDays(7))).isZero();
    clock.advance(Duration.ofDays(2));
    assertThat(games.deleteFinishedGames(Duration.ofDays(7))).isEqualTo(1);

    for (String table : List.of("game", "game_player", "game_station", "game_event", "game_route", "game_position")) {
      String column = table.equals("game") ? "id" : "game_id";
      assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM " + table + " WHERE " + column + " = ?", Integer.class, gameId))
        .as(table).isZero();
    }
    assertThat(players.findByTokenHash(AccessTokens.hash(abandoned[1].playerToken()))).isEmpty();
  }

  /** A game in the lobby whose host (first) is a seeker and whose second player is a hider. */
  private JoinedGameDTO[] gameWithSeekerAndHider() {
    JoinedGameDTO host = games.create(new GameRequests.CreateGameRequest(templateId, "Ada", 45));
    JoinedGameDTO grace = games.join(new GameRequests.JoinGameRequest(games.get(playerOf(host)).game().inviteCode(), "Grace"));
    games.setRole(playerOf(host), host.playerId(), PlayerRole.SEEKER);
    games.setRole(playerOf(host), grace.playerId(), PlayerRole.HIDER);
    return new JoinedGameDTO[]{host, grace};
  }

  /** The player as a request's token finds them. */
  private GamePlayerEntity playerOf(JoinedGameDTO joined) {
    return players.findByTokenHash(AccessTokens.hash(joined.playerToken())).orElseThrow();
  }

  private static void assertStatus(Runnable action, HttpStatus status) {
    assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
      exception -> assertThat(exception.getStatusCode()).isEqualTo(status));
  }
}
