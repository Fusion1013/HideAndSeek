package com.jetlag.game.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * The secrets that stand in for accounts: a player's token for their game, an owner's token for their template.
 * Only the hash is stored. The tokens are 256 random bits, so a plain SHA-256 is enough; unlike a password there
 * is nothing to guess, and a fixed hash can be looked up directly.
 */
public final class AccessTokens {

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final int TOKEN_BYTES = 32;

  private AccessTokens() {
  }

  /** A new token, to send to its holder once, and its hash, to store. */
  public record IssuedToken(String token, byte[] hash) {
  }

  public static IssuedToken issue() {
    byte[] bytes = new byte[TOKEN_BYTES];
    RANDOM.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    return new IssuedToken(token, hash(token));
  }

  public static byte[] hash(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required of every JVM", e);
    }
  }

  /** Compares in constant time, so the response time says nothing about how much of a guess was right. */
  public static boolean matches(String token, byte[] expectedHash) {
    return token != null && MessageDigest.isEqual(hash(token), expectedHash);
  }
}
