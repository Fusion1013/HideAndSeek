package com.jetlag.game.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The limits over real HTTP, with the client's address forwarded as nginx forwards it; skipped without Docker.
 * The test talks to the backend from 127.0.0.1, which (like the proxies' private addresses) is trusted to forward.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
  properties = {"gtfs.update.enabled=false", "overpass.update.enabled=false", "game.rate-limits.join-per-minute=3"})
@Testcontainers(disabledWithoutDocker = true)
class RateLimitTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  @LocalServerPort
  private int port;

  private final HttpClient http = HttpClient.newHttpClient();

  @Test
  void limitsJoinAttemptsPerForwardedClient() throws Exception {
    for (int i = 0; i < 3; i++) {
      assertThat(join("203.0.113.5").statusCode()).isEqualTo(404);
    }
    HttpResponse<String> limited = join("203.0.113.5");
    assertThat(limited.statusCode()).isEqualTo(429);
    assertThat(limited.headers().firstValue("Retry-After")).get().satisfies(seconds ->
      assertThat(Integer.parseInt(seconds)).isBetween(1, 60));
    assertThat(limited.body()).contains("Too many attempts");

    // Another client, behind the same proxies, is not affected
    assertThat(join("203.0.113.6").statusCode()).isEqualTo(404);
    // A proxy chain as Caddy and nginx send it: the client first, then the proxy's private address
    assertThat(join("203.0.113.5, 172.18.0.3").statusCode()).isEqualTo(429);
  }

  private HttpResponse<String> join(String forwardedFor) throws Exception {
    return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/games/join"))
        .header("Content-Type", "application/json")
        .header("X-Forwarded-For", forwardedFor)
        .POST(HttpRequest.BodyPublishers.ofString("{\"inviteCode\":\"ZZZZZZ\",\"displayName\":\"Linus\"}"))
        .build(),
      HttpResponse.BodyHandlers.ofString());
  }
}
