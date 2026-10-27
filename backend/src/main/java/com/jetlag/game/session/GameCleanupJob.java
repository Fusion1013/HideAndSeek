package com.jetlag.game.session;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Ends abandoned games, and trims finished ones down to what their recap and replay need. Finished games are kept
 * for their players to look back at, unless a time to keep them is configured: they hold the players' positions.
 * Templates are not touched.
 */
@Component
class GameCleanupJob {

  private static final Logger logger = LoggerFactory.getLogger(GameCleanupJob.class);

  private final GameService gameService;
  private final Duration idleFor;
  /** Null: kept for ever. */
  private final Duration keepFor;

  GameCleanupJob(GameService gameService,
                 @Value("${game.cleanup.idle-after:PT24H}") Duration idleFor,
                 @Value("${game.cleanup.keep-finished-for:#{null}}") Duration keepFor) {
    this.gameService = gameService;
    this.idleFor = idleFor;
    this.keepFor = keepFor;
  }

  @Scheduled(fixedDelayString = "${game.cleanup.interval:PT1H}", initialDelayString = "PT1M")
  void cleanUp() {
    int finished = gameService.finishIdleGames(idleFor);
    int trimmed = gameService.trimFinishedGames();
    int deleted = keepFor == null ? 0 : gameService.deleteFinishedGames(keepFor);
    if (finished > 0 || trimmed > 0 || deleted > 0) {
      logger.info("Game cleanup: ended {} idle games, trimmed {} events of finished games{}", finished, trimmed,
        keepFor == null ? "" : ", deleted " + deleted + " finished more than " + keepFor + " ago");
    }
  }
}
