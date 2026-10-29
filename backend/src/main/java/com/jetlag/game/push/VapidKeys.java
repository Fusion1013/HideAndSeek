package com.jetlag.game.push;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;

/**
 * The server's VAPID key pair (RFC 8292), which push services use to tell that a message comes from the server
 * the browser subscribed with. Made once and kept in the database: a new pair would leave every subscription
 * unusable.
 */
@Component
public class VapidKeys {

  /** How long a signed token is good for; push services refuse more than 24 hours. */
  static final Duration TOKEN_LIFETIME = Duration.ofHours(12);
  private static final Base64.Encoder BASE64 = Base64.getUrlEncoder().withoutPadding();

  private final JdbcTemplate jdbcTemplate;
  private final Clock clock;
  private final String subject;
  private volatile Keys keys;

  public VapidKeys(JdbcTemplate jdbcTemplate, Clock clock, @Value("${push.subject}") String subject) {
    this.jdbcTemplate = jdbcTemplate;
    this.clock = clock;
    this.subject = subject;
  }

  private record Keys(String publicKey, PrivateKey privateKey) {
  }

  /** The public key as browsers take it when subscribing: an uncompressed point, base64url. */
  public String publicKey() {
    return keys().publicKey();
  }

  /** The Authorization header for a message to this endpoint. */
  String authorization(URI endpoint) {
    Keys current = keys();
    String header = BASE64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
    String claims = BASE64.encodeToString("{\"aud\":\"%s\",\"exp\":%d,\"sub\":\"%s\"}".formatted(
      endpoint.getScheme() + "://" + endpoint.getAuthority(), clock.instant().plus(TOKEN_LIFETIME).getEpochSecond(),
      subject).getBytes(StandardCharsets.UTF_8));
    try {
      // JWS wants the signature as r and s side by side, not the DER sequence Java writes by default
      Signature signature = Signature.getInstance("SHA256withECDSAinP1363Format");
      signature.initSign(current.privateKey());
      signature.update((header + "." + claims).getBytes(StandardCharsets.US_ASCII));
      return "vapid t=" + header + "." + claims + "." + BASE64.encodeToString(signature.sign())
        + ", k=" + current.publicKey();
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("The VAPID token could not be signed", e);
    }
  }

  private Keys keys() {
    Keys current = keys;
    if (current == null) {
      synchronized (this) {
        if (keys == null) keys = loadOrCreate();
        current = keys;
      }
    }
    return current;
  }

  /** The stored pair, or a new one; when two servers race to make it, the first one stored wins. */
  private Keys loadOrCreate() {
    KeyPair created = WebPushEncryption.newKeyPair();
    jdbcTemplate.update("""
        INSERT INTO game_push_key (id, public_key, private_key, created_at) VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
        """,
      BASE64.encodeToString(WebPushEncryption.rawPublicKey((ECPublicKey) created.getPublic())),
      Base64.getEncoder().encodeToString(created.getPrivate().getEncoded()), Timestamp.from(clock.instant()));
    return jdbcTemplate.queryForObject("SELECT public_key, private_key FROM game_push_key WHERE id = 1",
      (row, index) -> new Keys(row.getString("public_key"), privateKey(row.getString("private_key"))));
  }

  private static PrivateKey privateKey(String pkcs8) {
    try {
      return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pkcs8)));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("The stored VAPID private key cannot be read", e);
    }
  }
}
