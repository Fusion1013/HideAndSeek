package com.jetlag.game.session;

import com.jetlag.game.question.QuestionService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Ends the hiding time, and questions' time to answer, on schedule. Players no longer ask for the game every few
 * seconds; their event streams only hear about such a change if something makes it, and this is that something.
 */
@Component
class GamePhaseJob {

  /** How late the players may hear that a time ran out, at most. */
  static final long INTERVAL_MS = 2000;

  private final GameService gameService;
  private final QuestionService questionService;

  GamePhaseJob(GameService gameService, QuestionService questionService) {
    this.gameService = gameService;
    this.questionService = questionService;
  }

  @Scheduled(fixedDelay = INTERVAL_MS)
  void advancePhases() {
    gameService.advancePhases();
    questionService.expireOverdue();
  }
}
