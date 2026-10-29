package com.jetlag.game.push;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import com.jetlag.game.session.GamePlayerEntity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/** Notifications on a player's device: the server's key to subscribe with, and each player's subscription. */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api", produces = MediaType.APPLICATION_JSON_VALUE)
public class PushController {

  /**
   * The push services of the browsers in use. A subscription is where the server will post, so it may only be one
   * of these: anything else would let a player make the server send requests wherever they like.
   */
  static final List<String> PUSH_SERVICE_DOMAINS = List.of(
    "googleapis.com", "mozilla.com", "notify.windows.com", "push.apple.com");
  private static final int MAX_ENDPOINT_LENGTH = 1000;

  public record PushKeyDTO(
    @Schema(description = "The server's VAPID public key, base64url, to subscribe with",
      requiredMode = Schema.RequiredMode.REQUIRED)
    String publicKey
  ) {
  }

  /** A browser's push subscription, as its PushSubscription.toJSON() gives it. */
  public record PushSubscriptionRequest(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String endpoint,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SubscriptionKeys keys
  ) {
    public record SubscriptionKeys(
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String p256dh,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String auth
    ) {
    }
  }

  public record PushStatusDTO(
    @Schema(description = "Where the player's notifications are sent; null when they get none") String endpoint
  ) {
  }

  private final VapidKeys vapidKeys;
  private final PushSubscriptions subscriptions;
  private final Clock clock;

  public PushController(VapidKeys vapidKeys, PushSubscriptions subscriptions, Clock clock) {
    this.vapidKeys = vapidKeys;
    this.subscriptions = subscriptions;
    this.clock = clock;
  }

  @GetMapping("/push/public-key")
  @Operation(
    operationId = "getPushPublicKey",
    summary = "Get the key browsers subscribe to notifications with",
    responses = @ApiResponse(responseCode = "200", description = "The server's VAPID public key")
  )
  public PushKeyDTO getPushPublicKey() {
    return new PushKeyDTO(vapidKeys.publicKey());
  }

  @GetMapping("/games/{gameId}/push-subscription")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "getPushSubscription",
    summary = "Whether the player gets notifications, and where",
    responses = @ApiResponse(responseCode = "200", description = "The player's subscription's endpoint, or none")
  )
  public PushStatusDTO getPushSubscription(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    return new PushStatusDTO(subscriptions.endpointOf(player.getId()).orElse(null));
  }

  @PutMapping("/games/{gameId}/push-subscription")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "subscribeToPush",
    summary = "Send the player's notifications to this subscription",
    description = "Replaces the subscription the player had. The endpoint must be a browser push service's.",
    responses = {
      @ApiResponse(responseCode = "200", description = "Subscribed"),
      @ApiResponse(responseCode = "400", description = "Not a push subscription this server can send to")
    }
  )
  public PushStatusDTO subscribeToPush(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                                       @RequestBody PushSubscriptionRequest request) {
    String endpoint = validEndpoint(request.endpoint());
    PushSubscriptionRequest.SubscriptionKeys keys = request.keys();
    if (keys == null || !decodesTo(keys.p256dh(), WebPushEncryption.PUBLIC_KEY_BYTES) || !decodesTo(keys.auth(), 16)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The subscription's keys are missing or malformed");
    }
    subscriptions.save(player.getId(), endpoint, keys.p256dh(), keys.auth(), clock.instant());
    return new PushStatusDTO(endpoint);
  }

  @DeleteMapping("/games/{gameId}/push-subscription")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "unsubscribeFromPush",
    summary = "Stop sending the player notifications",
    responses = @ApiResponse(responseCode = "204", description = "Unsubscribed, or was not subscribed")
  )
  public void unsubscribeFromPush(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    subscriptions.delete(player.getId());
  }

  static String validEndpoint(String endpoint) {
    if (endpoint == null || endpoint.length() > MAX_ENDPOINT_LENGTH) throw notAPushService();
    URI uri;
    try {
      uri = new URI(endpoint);
    } catch (URISyntaxException e) {
      throw notAPushService();
    }
    String host = uri.getHost();
    if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getPort() != -1
      || PUSH_SERVICE_DOMAINS.stream().noneMatch(domain -> host.equals(domain) || host.endsWith("." + domain))) {
      throw notAPushService();
    }
    return endpoint;
  }

  private static ResponseStatusException notAPushService() {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a browser push service's address");
  }

  private static boolean decodesTo(String value, int length) {
    if (value == null) return false;
    try {
      return Base64.getUrlDecoder().decode(value).length == length;
    } catch (IllegalArgumentException e) {
      return false;
    }
  }
}
