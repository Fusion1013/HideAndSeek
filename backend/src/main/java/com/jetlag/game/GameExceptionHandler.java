package com.jetlag.game;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Errors the game endpoints share. */
@RestControllerAdvice(basePackages = "com.jetlag.game")
public class GameExceptionHandler {

  /** Two players changed the same game at once (say, the host starting it twice); the second change is refused. */
  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  public ProblemDetail concurrentChange() {
    return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
      "Someone else changed the game at the same moment. Try again.");
  }
}
