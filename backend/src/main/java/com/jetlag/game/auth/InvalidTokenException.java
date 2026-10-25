package com.jetlag.game.auth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 401: the request had no token, or one nobody holds. */
public class InvalidTokenException extends ResponseStatusException {

  public InvalidTokenException() {
    super(HttpStatus.UNAUTHORIZED, "A valid token is required");
  }

  @Override
  public HttpHeaders getHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
    return headers;
  }
}
