package com.jetlag.game.auth;

import java.util.Optional;

/** Reads the token from an {@code Authorization: Bearer <token>} header. */
public final class BearerToken {

  private static final String PREFIX = "Bearer ";

  private BearerToken() {
  }

  public static Optional<String> from(String authorizationHeader) {
    if (authorizationHeader == null || !authorizationHeader.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
      return Optional.empty();
    }
    String token = authorizationHeader.substring(PREFIX.length()).trim();
    return token.isEmpty() ? Optional.empty() : Optional.of(token);
  }
}
