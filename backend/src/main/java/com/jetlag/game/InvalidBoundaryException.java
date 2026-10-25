package com.jetlag.game;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 400: a play area that is not a usable polygon. */
public class InvalidBoundaryException extends ResponseStatusException {

  public InvalidBoundaryException(String reason) {
    super(HttpStatus.BAD_REQUEST, reason);
  }
}
