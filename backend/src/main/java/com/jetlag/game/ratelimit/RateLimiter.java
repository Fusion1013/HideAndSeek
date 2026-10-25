package com.jetlag.game.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Counts requests per key (a limit and a client) in fixed one-minute windows. In memory: one backend instance
 * serves every request, and a restart only forgives a minute's worth.
 */
public class RateLimiter {

  static final Duration WINDOW = Duration.ofMinutes(1);
  /** Past this many keys, windows that have ended are dropped, so memory stays bounded. */
  private static final int PRUNE_ABOVE = 10_000;

  private record Window(Instant start, int count) {
  }

  private final Map<String, Window> windows = new ConcurrentHashMap<>();
  private final Clock clock;

  public RateLimiter(Clock clock) {
    this.clock = clock;
  }

  /**
   * Counts a request; returns zero when it may go ahead, or how long until it may, when the key has had
   * {@code perMinute} requests in its current window already.
   */
  public Duration acquire(String key, int perMinute) {
    Instant now = clock.instant();
    if (windows.size() > PRUNE_ABOVE) {
      windows.values().removeIf(window -> !window.start().plus(WINDOW).isAfter(now));
    }
    Window window = windows.compute(key, (k, current) ->
      current == null || !current.start().plus(WINDOW).isAfter(now)
        ? new Window(now, 1)
        : new Window(current.start(), current.count() + 1));
    return window.count() <= perMinute ? Duration.ZERO : Duration.between(now, window.start().plus(WINDOW));
  }
}
