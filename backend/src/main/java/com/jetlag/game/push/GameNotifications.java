package com.jetlag.game.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.game.events.EventAudience;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Notifications on the players' devices, for what they should not miss while the game's page is closed or out of
 * sight: a question to answer, an answer, the seekers setting off, the end. Sent through each player's push
 * subscription once the change that caused them commits; a player without one gets none.
 */
@Component
public class GameNotifications {

  private static final Logger logger = LoggerFactory.getLogger(GameNotifications.class);
  private static final Duration TIMEOUT = Duration.ofSeconds(10);
  private static final Base64.Decoder BASE64 = Base64.getUrlDecoder();

  /**
   * What to tell whom. {@code tag} groups notifications: a new one with the same tag replaces the last.
   * {@code ttl} is how long the push service keeps trying to deliver it, after which it would be news no more.
   */
  public record Notification(UUID gameId, EventAudience audience, UUID except, String title, String body, String tag,
                             Duration ttl) {
  }

  private final PushSubscriptions subscriptions;
  private final VapidKeys vapidKeys;
  private final ObjectMapper objectMapper;
  private final ApplicationEventPublisher publisher;
  private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();

  public GameNotifications(PushSubscriptions subscriptions, VapidKeys vapidKeys, ObjectMapper objectMapper,
                           ApplicationEventPublisher publisher) {
    this.subscriptions = subscriptions;
    this.vapidKeys = vapidKeys;
    this.objectMapper = objectMapper;
    this.publisher = publisher;
  }

  /** Sends the notification once the caller's transaction commits; nothing if it rolls back. */
  public void send(Notification notification) {
    publisher.publishEvent(notification);
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  void deliver(Notification notification) {
    var recipients = subscriptions.of(notification.gameId(), notification.audience(), notification.except());
    if (recipients.isEmpty()) return;
    byte[] payload = payload(notification);
    for (PushSubscriptions.Subscription subscription : recipients) {
      try {
        post(subscription, payload, notification.ttl());
      } catch (RuntimeException e) {
        logger.warn("Push to player {} not sent: {}", subscription.playerId(), e.getMessage());
      }
    }
  }

  /** Posted without waiting for the answer; a subscription the push service has forgotten is removed. */
  private void post(PushSubscriptions.Subscription subscription, byte[] payload, Duration ttl) {
    URI endpoint = URI.create(subscription.endpoint());
    byte[] body = WebPushEncryption.encrypt(payload, BASE64.decode(subscription.p256dh()),
      BASE64.decode(subscription.auth()));
    HttpRequest request = HttpRequest.newBuilder(endpoint)
      .timeout(TIMEOUT)
      .header("Authorization", vapidKeys.authorization(endpoint))
      .header("Content-Encoding", "aes128gcm")
      .header("Content-Type", "application/octet-stream")
      .header("TTL", Long.toString(ttl.toSeconds()))
      .header("Urgency", "high")
      .POST(HttpRequest.BodyPublishers.ofByteArray(body))
      .build();
    httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding()).whenComplete((response, error) -> {
      if (error != null) {
        logger.warn("Push to player {} failed: {}", subscription.playerId(), error.getMessage());
      } else if (response.statusCode() == 404 || response.statusCode() == 410) {
        subscriptions.deleteGone(subscription.playerId(), subscription.endpoint());
      } else if (response.statusCode() >= 300) {
        logger.warn("Push to player {} refused with {}", subscription.playerId(), response.statusCode());
      }
    });
  }

  /**
   * The message as the Angular service worker shows it: a notification whose click opens the game, in a window
   * of the app that is already open if there is one.
   */
  private byte[] payload(Notification notification) {
    String url = "/game/" + notification.gameId();
    Map<String, Object> shown = Map.of(
      "title", notification.title(),
      "body", notification.body(),
      "tag", notification.tag(),
      "renotify", true,
      "icon", "/icons/icon-192.png",
      "badge", "/icons/badge-96.png",
      "data", Map.of("onActionClick", Map.of(
        "default", Map.of("operation", "navigateLastFocusedOrOpen", "url", url))));
    try {
      return objectMapper.writeValueAsString(Map.of("notification", shown)).getBytes(StandardCharsets.UTF_8);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("A notification could not be written as JSON", e);
    }
  }
}
