package com.jetlag.game.push;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/** Against a new PostGIS database in Docker; skipped without Docker. */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class VapidKeysTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-29T12:00:00Z"), ZoneOffset.UTC);

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @Test
  void keepsThePairItMadeFirst() {
    String first = new VapidKeys(jdbcTemplate, CLOCK, "mailto:a@example.com").publicKey();
    String again = new VapidKeys(jdbcTemplate, CLOCK, "mailto:a@example.com").publicKey();

    assertThat(again).isEqualTo(first);
    assertThat(Base64.getUrlDecoder().decode(first)).hasSize(65);
  }

  @Test
  void signsATokenForThePushServicesOrigin() throws Exception {
    VapidKeys keys = new VapidKeys(jdbcTemplate, CLOCK, "mailto:a@example.com");

    String authorization = keys.authorization(URI.create("https://fcm.googleapis.com/fcm/send/abc"));

    assertThat(authorization).startsWith("vapid t=").endsWith(", k=" + keys.publicKey());
    String[] token = authorization.substring("vapid t=".length(), authorization.indexOf(',')).split("\\.");
    String claims = new String(Base64.getUrlDecoder().decode(token[1]), StandardCharsets.UTF_8);
    assertThat(claims).isEqualTo("{\"aud\":\"https://fcm.googleapis.com\",\"exp\":%d,\"sub\":\"mailto:a@example.com\"}"
      .formatted(CLOCK.instant().plus(VapidKeys.TOKEN_LIFETIME).getEpochSecond()));

    Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
    verifier.initVerify(WebPushEncryption.publicKey(Base64.getUrlDecoder().decode(keys.publicKey())));
    verifier.update((token[0] + "." + token[1]).getBytes(StandardCharsets.US_ASCII));
    assertThat(verifier.verify(Base64.getUrlDecoder().decode(token[2]))).isTrue();
  }
}
