package com.jetlag.game.push;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.game.events.EventAudience;
import com.jetlag.game.push.GameNotifications.Notification;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Delivery to a stand-in push service on this machine, decrypted as the browser would. */
class GameNotificationsTest {

  private static final UUID GAME = UUID.fromString("00000000-0000-0000-0000-00000000000a");
  private static final UUID PLAYER = UUID.fromString("00000000-0000-0000-0000-00000000000b");
  private static final Base64.Encoder BASE64 = Base64.getUrlEncoder().withoutPadding();

  private record Received(Map<String, List<String>> headers, byte[] body) {
  }

  private final PushSubscriptions subscriptions = mock(PushSubscriptions.class);
  private final VapidKeys vapidKeys = mock(VapidKeys.class);
  private final GameNotifications notifications = new GameNotifications(subscriptions, vapidKeys, new ObjectMapper(),
    mock(ApplicationEventPublisher.class));
  private final KeyPair browser = WebPushEncryption.newKeyPair();
  private final byte[] authSecret = new byte[16];
  private final CompletableFuture<Received> received = new CompletableFuture<>();
  private HttpServer pushService;
  private int status = 201;

  @BeforeEach
  void startPushService() throws Exception {
    pushService = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    pushService.createContext("/push", exchange -> {
      received.complete(new Received(exchange.getRequestHeaders(), exchange.getRequestBody().readAllBytes()));
      exchange.sendResponseHeaders(status, -1);
      exchange.close();
    });
    pushService.start();
    when(vapidKeys.authorization(any(URI.class))).thenReturn("vapid t=token, k=key");
    when(subscriptions.of(GAME, EventAudience.HIDERS, null)).thenReturn(List.of(new PushSubscriptions.Subscription(
      PLAYER, "http://127.0.0.1:" + pushService.getAddress().getPort() + "/push",
      BASE64.encodeToString(WebPushEncryption.rawPublicKey((ECPublicKey) browser.getPublic())),
      BASE64.encodeToString(authSecret))));
  }

  @AfterEach
  void stopPushService() {
    pushService.stop(0);
  }

  @Test
  void postsAnEncryptedNotificationThatOpensTheGame() throws Exception {
    notifications.deliver(new Notification(GAME, EventAudience.HIDERS, null, "Göteborg", "A radar question is waiting",
      "question", Duration.ofMinutes(5)));

    Received push = received.get(5, TimeUnit.SECONDS);
    assertThat(push.headers().get("Content-encoding")).containsExactly("aes128gcm");
    assertThat(push.headers().get("Ttl")).containsExactly("300");
    assertThat(push.headers().get("Authorization")).containsExactly("vapid t=token, k=key");

    JsonNode shown = new ObjectMapper().readTree(decrypt(push.body())).get("notification");
    assertThat(shown.get("title").asText()).isEqualTo("Göteborg");
    assertThat(shown.get("body").asText()).isEqualTo("A radar question is waiting");
    assertThat(shown.get("tag").asText()).isEqualTo("question");
    assertThat(shown.at("/data/onActionClick/default/url").asText()).isEqualTo("/game/" + GAME);
  }

  @Test
  void forgetsASubscriptionThePushServiceNoLongerHas() throws Exception {
    status = 410;
    notifications.deliver(new Notification(GAME, EventAudience.HIDERS, null, "Göteborg", "Gone", "phase",
      Duration.ofMinutes(5)));

    received.get(5, TimeUnit.SECONDS);
    verify(subscriptions, timeout(5000)).deleteGone(any(), any());
  }

  /** The browser's side of RFC 8291. */
  private byte[] decrypt(byte[] message) throws Exception {
    ByteBuffer buffer = ByteBuffer.wrap(message);
    byte[] salt = new byte[16];
    buffer.get(salt);
    buffer.getInt();
    byte[] senderPublic = new byte[buffer.get()];
    buffer.get(senderPublic);
    byte[] ciphertext = new byte[buffer.remaining()];
    buffer.get(ciphertext);

    KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
    agreement.init(browser.getPrivate());
    agreement.doPhase(WebPushEncryption.publicKey(senderPublic), true);
    byte[] browserPublic = WebPushEncryption.rawPublicKey((ECPublicKey) browser.getPublic());
    byte[] keyInfo = ByteBuffer.allocate(14 + 65 + 65).put("WebPush: info\0".getBytes(StandardCharsets.US_ASCII))
      .put(browserPublic).put(senderPublic).array();
    byte[] inputKey = hkdf(authSecret, agreement.generateSecret(), keyInfo, 32);
    byte[] contentKey = hkdf(salt, inputKey, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
    byte[] nonce = hkdf(salt, inputKey, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(contentKey, "AES"), new GCMParameterSpec(128, nonce));
    byte[] padded = cipher.doFinal(ciphertext);
    assertThat(padded[padded.length - 1]).isEqualTo((byte) 2);
    return Arrays.copyOf(padded, padded.length - 1);
  }

  private static byte[] hkdf(byte[] salt, byte[] inputKey, byte[] info, int length) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(salt, "HmacSHA256"));
    byte[] pseudoRandomKey = mac.doFinal(inputKey);
    mac.init(new SecretKeySpec(pseudoRandomKey, "HmacSHA256"));
    mac.update(info);
    return Arrays.copyOf(mac.doFinal(new byte[]{1}), length);
  }
}
