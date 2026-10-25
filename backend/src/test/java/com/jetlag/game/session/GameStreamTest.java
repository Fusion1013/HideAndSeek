package com.jetlag.game.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.game.events.EventAudience;
import com.jetlag.game.events.GameEventLog;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The event stream over real HTTP, against a new PostGIS database in Docker; skipped without Docker.
 * Each player reads their own stream, as each browser would.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
  properties = {"gtfs.update.enabled=false", "overpass.update.enabled=false",
    // Every test creates and joins games from the same address; the limits are tested in RateLimitTest
    "game.rate-limits.join-per-minute=1000", "game.rate-limits.create-game-per-minute=1000",
    "game.rate-limits.create-template-per-minute=1000"})
@Testcontainers(disabledWithoutDocker = true)
class GameStreamTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final String BOX = "[[11.9,57.6],[12.1,57.6],[12.1,57.8],[11.9,57.8]]";

  @LocalServerPort
  private int port;

  @Autowired
  private ObjectMapper objectMapper;

  @Autowired
  private GameEventLog eventLog;

  @Autowired
  private TransactionTemplate transactionTemplate;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<EventStream> streams = new ArrayList<>();

  private UUID gameId;
  private String inviteCode;
  private JsonNode host;

  /** A server-sent event as the client parses it. */
  record Event(String id, String type, JsonNode data) {
  }

  /** One open stream, read on its own thread. */
  final class EventStream implements AutoCloseable {
    private final BlockingQueue<Event> events = new LinkedBlockingQueue<>();
    private final Stream<String> lines;
    final int status;

    EventStream(HttpResponse<Stream<String>> response) {
      status = response.statusCode();
      lines = response.body();
      Thread.ofVirtual().start(() -> {
        String id = null;
        String type = "message";
        StringBuilder data = new StringBuilder();
        try {
          for (String line : (Iterable<String>) lines::iterator) {
            if (line.isEmpty()) {
              if (!data.isEmpty()) events.add(new Event(id, type, objectMapper.readTree(data.toString())));
              type = "message";
              data.setLength(0);
            } else if (line.startsWith("id:")) {
              id = line.substring(3).trim();
            } else if (line.startsWith("event:")) {
              type = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              data.append(line.substring(5));
            }
          }
        } catch (Exception e) {
          // Closed by the test
        }
      });
    }

    /** The next event other than a heartbeat. */
    Event next() throws InterruptedException {
      while (true) {
        Event event = events.poll(10, TimeUnit.SECONDS);
        assertThat(event).as("an event within 10 seconds").isNotNull();
        if (!event.type().equals("heartbeat")) return event;
      }
    }

    /** Whether another event (other than a heartbeat) arrives within a moment. */
    boolean quiet() throws InterruptedException {
      Event event;
      do {
        event = events.poll(1, TimeUnit.SECONDS);
      } while (event != null && event.type().equals("heartbeat"));
      return event == null;
    }

    @Override
    public void close() {
      lines.close();
    }
  }

  @BeforeEach
  void createGame() throws Exception {
    JsonNode template = post("/api/templates", null, "{\"name\":\"Göteborg\",\"boundary\":" + BOX + ",\"routeIds\":[]}");
    host = post("/api/games", null,
      "{\"templateId\":\"" + template.at("/template/id").asText() + "\",\"displayName\":\"Ada\",\"hidingMinutes\":30}");
    gameId = UUID.fromString(host.get("gameId").asText());
    inviteCode = get("/api/games/" + gameId, host.get("playerToken").asText()).at("/game/inviteCode").asText();
  }

  @AfterEach
  void closeStreams() {
    streams.forEach(EventStream::close);
  }

  @Test
  void startsWithASnapshotThenSendsEachChangeAsItHappens() throws Exception {
    EventStream stream = open(host, null);
    assertThat(stream.status).isEqualTo(200);

    Event snapshot = stream.next();
    assertThat(snapshot.type()).isEqualTo("snapshot");
    assertThat(snapshot.data().at("/myPlayerId").asText()).isEqualTo(host.get("playerId").asText());
    assertThat(snapshot.data().at("/game/players")).hasSize(1);
    assertThat(snapshot.data().has("serverTime")).isTrue();

    join("Grace");
    Event joined = stream.next();
    assertThat(joined.type()).isEqualTo("game");
    assertThat(Long.parseLong(joined.id())).isGreaterThan(Long.parseLong(snapshot.id()));
    assertThat(joined.data().get("players")).extracting(player -> player.get("displayName").asText())
      .containsExactly("Ada", "Grace");
    assertThat(joined.data().has("myPlayerId")).isFalse();
  }

  @Test
  void replaysWhatAReconnectingPlayerMissed() throws Exception {
    EventStream first = open(host, null);
    String lastSeen = first.next().id();
    first.close();

    join("Grace");
    join("Linus");

    EventStream again = open(host, lastSeen);
    Event grace = again.next();
    Event linus = again.next();
    assertThat(grace.type()).isEqualTo("game");
    assertThat(grace.data().get("players")).hasSize(2);
    assertThat(linus.data().get("players")).hasSize(3);
    assertThat(again.next().type()).isEqualTo("caught-up");

    // Nothing missed: no replay, and no snapshot either
    EventStream upToDate = open(host, linus.id());
    assertThat(upToDate.quiet()).isTrue();

    // An ID the log never reached cannot be caught up from: a snapshot instead
    assertThat(open(host, "999999999").next().type()).isEqualTo("snapshot");
  }

  @Test
  void sendsAnEventOnlyToTheSideItIsFor() throws Exception {
    JsonNode grace = join("Grace");
    String hostToken = host.get("playerToken").asText();
    put("/api/games/" + gameId + "/players/" + host.get("playerId").asText() + "/role", hostToken, "{\"role\":\"SEEKER\"}");
    put("/api/games/" + gameId + "/players/" + grace.get("playerId").asText() + "/role", hostToken, "{\"role\":\"HIDER\"}");

    EventStream seeker = open(host, null);
    EventStream hider = open(grace, null);
    seeker.next();
    hider.next();

    transactionTemplate.executeWithoutResult(status -> {
      eventLog.record(gameId, "secret", EventAudience.HIDERS, Map.of("station", "Centralstationen"));
      eventLog.record(gameId, "ping", EventAudience.ALL, Map.of());
    });

    assertThat(hider.next().type()).isEqualTo("secret");
    assertThat(hider.next().type()).isEqualTo("ping");
    assertThat(seeker.next().type()).isEqualTo("ping");

    // Nor in a replay
    EventStream seekerAgain = open(host, "0");
    List<String> types = new ArrayList<>();
    for (Event event = seekerAgain.next(); !event.type().equals("caught-up"); event = seekerAgain.next()) {
      types.add(event.type());
    }
    assertThat(types).contains("ping").doesNotContain("secret");
  }

  @Test
  void neverSendsTheHidingStationOrTheSeekersPositionsToASeeker() throws Exception {
    JsonNode grace = join("Grace");
    String hostToken = host.get("playerToken").asText();
    String graceToken = grace.get("playerToken").asText();
    put("/api/games/" + gameId + "/players/" + host.get("playerId").asText() + "/role", hostToken, "{\"role\":\"SEEKER\"}");
    put("/api/games/" + gameId + "/players/" + grace.get("playerId").asText() + "/role", hostToken, "{\"role\":\"HIDER\"}");
    post("/api/games/" + gameId + "/start", hostToken, "");
    // The test template has no routes, so the game has no stations of its own
    jdbcTemplate.update("INSERT INTO game_station VALUES (?, 'central', 'Centralstationen', ST_SetSRID(ST_MakePoint(11.97, 57.70), 4326))",
      gameId);

    EventStream seeker = open(host, null);
    EventStream hider = open(grace, null);
    assertThat(seeker.next().data().get("hidingStation").isNull()).isTrue();
    hider.next();

    put("/api/games/" + gameId + "/hiding-station", graceToken, "{\"stationId\":\"central\"}");
    send(HttpRequest.newBuilder(uri("/api/games/" + gameId + "/location"))
      .header("Content-Type", "application/json").header("Authorization", "Bearer " + hostToken)
      .POST(HttpRequest.BodyPublishers.ofString("{\"longitude\":11.98,\"latitude\":57.71,\"accuracyMeters\":10}")), false);

    assertThat(hider.next().type()).isEqualTo("hiding-station");
    Event location = hider.next();
    assertThat(location.type()).isEqualTo("seeker-location");
    assertThat(location.data().get("playerId").asText()).isEqualTo(host.get("playerId").asText());
    assertThat(seeker.quiet()).isTrue();

    JsonNode seekerView = get("/api/games/" + gameId, hostToken);
    assertThat(seekerView.get("hidingStation").isNull()).isTrue();
    assertThat(seekerView.get("seekerLocations")).isEmpty();
    assertThat(seekerView.toString()).doesNotContain("Centralstationen");
    JsonNode hiderView = get("/api/games/" + gameId, graceToken);
    assertThat(hiderView.at("/hidingStation/station/name").asText()).isEqualTo("Centralstationen");
    assertThat(hiderView.get("seekerLocations")).hasSize(1);
  }

  @Test
  void refusesAStreamWithoutTheGamesToken() throws Exception {
    HttpResponse<Void> response = http.send(HttpRequest.newBuilder(uri("/api/games/" + gameId + "/events")).GET().build(),
      HttpResponse.BodyHandlers.discarding());
    assertThat(response.statusCode()).isEqualTo(401);
  }

  private EventStream open(JsonNode player, String lastEventId) throws Exception {
    HttpRequest.Builder request = HttpRequest.newBuilder(uri("/api/games/" + gameId + "/events"))
      .header("Authorization", "Bearer " + player.get("playerToken").asText())
      .header("Accept", "text/event-stream")
      .GET();
    if (lastEventId != null) request.header("Last-Event-ID", lastEventId);
    EventStream stream = new EventStream(http.send(request.build(), HttpResponse.BodyHandlers.ofLines()));
    streams.add(stream);
    return stream;
  }

  private JsonNode join(String name) throws Exception {
    return post("/api/games/join", null, "{\"inviteCode\":\"" + inviteCode + "\",\"displayName\":\"" + name + "\"}");
  }

  private JsonNode get(String path, String token) throws Exception {
    return send(HttpRequest.newBuilder(uri(path)).header("Authorization", "Bearer " + token).GET());
  }

  private JsonNode post(String path, String token, String body) throws Exception {
    HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body));
    if (token != null) request.header("Authorization", "Bearer " + token);
    return send(request);
  }

  private JsonNode put(String path, String token, String body) throws Exception {
    return send(HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json")
      .header("Authorization", "Bearer " + token).PUT(HttpRequest.BodyPublishers.ofString(body)));
  }

  private JsonNode send(HttpRequest.Builder request) throws Exception {
    return send(request, true);
  }

  /** {@code withBody}: false for an answer without one (204). */
  private JsonNode send(HttpRequest.Builder request, boolean withBody) throws Exception {
    HttpResponse<String> response = http.send(request.timeout(Duration.ofSeconds(10)).build(),
      HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as(response.body()).isBetween(200, 299);
    return withBody ? objectMapper.readTree(response.body()) : null;
  }

  private URI uri(String path) {
    return URI.create("http://localhost:" + port + path);
  }
}
