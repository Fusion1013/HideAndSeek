package com.jetlag.game.session;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Ends abandoned games and, after a while, deletes finished ones. Games hold players' positions, so they are not
 * kept longer than needed. Templates are not touched.
 */
@Component
class GameCleanupJob {

  private static final Logger logger = LoggerFactory.getLogger(GameCleanupJob.class);

  private final GameService gameService;
  private final Duration idleFor;
  private final Duration keepFor;

  GameCleanupJob(GameService gameService,
                 @Value("${game.cleanup.idle-after:PT24H}") Duration idleFor,
                 @Value("${game.cleanup.keep-finished-for:P7D}") Duration keepFor) {
    this.gameService = gameService;
    this.idleFor = idleFor;
    this.keepFor = keepFor;
  }

  @Scheduled(fixedDelayString = "${game.cleanup.interval:PT1H}", initialDelayString = "PT1M")
  void cleanUp() {
    int finished = gameService.finishIdleGames(idleFor);
    int deleted = gameService.deleteFinishedGames(keepFor);
    if (finished > 0 || deleted > 0) {
      logger.info("Game cleanup: ended {} idle games, deleted {} finished more than {} ago", finished, deleted, keepFor);
    }
  }
}
