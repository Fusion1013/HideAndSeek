package com.jetlag.game.ratelimit;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTest {

  /** A clock the test moves forward. */
  private static final class TestClock extends Clock {
    private Instant now = Instant.parse("2026-10-25T12:00:00Z");

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }

  @Test
  void allowsTheLimitPerMinuteForEachKeyAndSaysHowLongToWait() {
    TestClock clock = new TestClock();
    RateLimiter limiter = new RateLimiter(clock);

    for (int i = 0; i < 3; i++) assertThat(limiter.acquire("join:1.2.3.4", 3)).isZero();
    clock.now = clock.now.plusSeconds(20);
    assertThat(limiter.acquire("join:1.2.3.4", 3)).isEqualTo(Duration.ofSeconds(40));
    assertThat(limiter.acquire("join:5.6.7.8", 3)).isZero();
    assertThat(limiter.acquire("create:1.2.3.4", 3)).isZero();

    // A new window starts once the minute is over
    clock.now = clock.now.plusSeconds(40);
    assertThat(limiter.acquire("join:1.2.3.4", 3)).isZero();
  }

  @Test
  void roundsTheWaitUpToWholeSecondsOfAtLeastOne() {
    TooManyRequestsException exception = new TooManyRequestsException(Duration.ofMillis(1200));
    assertThat(exception.getHeaders().getFirst("Retry-After")).isEqualTo("2");
    assertThat(new TooManyRequestsException(Duration.ZERO).getHeaders().getFirst("Retry-After")).isEqualTo("1");
    assertThat(exception.getReason()).isEqualTo("Too many attempts. Try again in 2 seconds.");
  }
}
