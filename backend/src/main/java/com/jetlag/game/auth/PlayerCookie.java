package com.jetlag.game.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * A second copy of the player's token, kept by the browser as a cookie the page cannot read. Browsers drop the
 * page's own storage far more readily (Safari after a week without a visit, storage pressure, cleared site data),
 * so the page can get its place in the game back with this: see {@code PlayerAccessController}. The cookie is only
 * ever used for that, never to authorize anything else, and is scoped to the one game's API path, so a browser in
 * several games keeps one cookie for each.
 */
public final class PlayerCookie {

  public static final String NAME = "jetlag_player";
  /** Longer than any game runs, so the replay can still be reached after it. */
  static final Duration MAX_AGE = Duration.ofDays(30);
  /**
   * The path the browser sees the API under when it is not at the site root (/hideandseek), as the proxy in front
   * passes it on. Only ever the cookie's path, so a request that sets its own can at worst lose its own cookie.
   */
  static final String PREFIX_HEADER = "X-Forwarded-Prefix";
  private static final Pattern PREFIX = Pattern.compile("(/[A-Za-z0-9._~-]+)+");

  private PlayerCookie() {
  }

  /** Sets the cookie for this game, replacing any earlier one. */
  public static void set(HttpServletRequest request, HttpServletResponse response, UUID gameId, String token) {
    response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(NAME, token)
      .path(prefix(request) + path(gameId))
      .maxAge(MAX_AGE)
      .httpOnly(true)
      // Browsers accept secure cookies from http://localhost too, so this holds in development as well
      .secure(true)
      // Only the site's own requests carry it, so another site cannot have a browser restore its place
      .sameSite("Strict")
      .build()
      .toString());
  }

  /** The cookie's token, if the request carries one. Only requests under the game's path carry its cookie. */
  public static Optional<String> from(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return Optional.empty();
    return Arrays.stream(cookies)
      .filter(cookie -> NAME.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank())
      .map(Cookie::getValue)
      .findFirst();
  }

  static String path(UUID gameId) {
    return "/api/games/" + gameId;
  }

  /** The proxy's prefix without a trailing slash, or "" when there is none or it is not a plain path. */
  static String prefix(HttpServletRequest request) {
    String header = request.getHeader(PREFIX_HEADER);
    if (header == null) return "";
    String prefix = header.strip().replaceAll("/+$", "");
    return PREFIX.matcher(prefix).matches() ? prefix : "";
  }
}
