package com.jetlag.game.ratelimit;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/** 429, with how long to wait in Retry-After. */
public class TooManyRequestsException extends ResponseStatusException {

  private final long retryAfterSeconds;

  public TooManyRequestsException(Duration retryAfter) {
    super(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in " + seconds(retryAfter) + " seconds.");
    this.retryAfterSeconds = seconds(retryAfter);
  }

  @Override
  public HttpHeaders getHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
    return headers;
  }

  private static long seconds(Duration duration) {
    return Math.max(1, (duration.toMillis() + 999) / 1000);
  }
}
