package com.jetlag.places.importer;

import com.jetlag.places.model.OverpassLocationCategory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.util.UUID;

/** Imports every Overpass category on a schedule; only exists when {@code overpass.update.enabled} is true. */
@Component
@ConditionalOnProperty(name = "overpass.update.enabled", havingValue = "true")
public class OverpassJob {

  private static final int MAX_ATTEMPTS = 10;
  private static final long RETRY_DELAY_MS = 20_000;

  private static final Logger logger = LoggerFactory.getLogger(OverpassJob.class);

  private final OverpassImportService overpassService;

  public OverpassJob(OverpassImportService overpassService) {
    this.overpassService = overpassService;
  }

  @Scheduled(
    initialDelayString = "${overpass.update.initial-delay-ms:10000}",
    fixedDelayString = "${overpass.update.fixed-delay-ms:86400000}"
  )
  public void updateAll() {
    logger.info("Starting overpass update");

    for (OverpassLocationCategory category : OverpassLocationCategory.values()) {
      if (category == OverpassLocationCategory.OTHER) continue;
      updateCategory(category);
    }
  }

  private void updateCategory(OverpassLocationCategory category) {
    for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        logger.info("Starting attempt {} for category {}", attempt, category.toString());
        int count = overpassService.updateOverpassData(UUID.randomUUID().toString(), category);
        logger.info("Overpass update successful: {} entries imported", count);
        return;
      } catch (Exception exception) {
        if (!isRetryable(exception)) {
          logger.error("Overpass update failed with a non-retryable error", exception);
          return;
        }
        if (attempt == MAX_ATTEMPTS) {
          logger.error("Overpass update failed after {} attempts", MAX_ATTEMPTS, exception);
          return;
        }
        logger.warn("Overpass update failed (attempt {}/{}), retrying in {} s: {}",
          attempt, MAX_ATTEMPTS, RETRY_DELAY_MS / 1000, exception.getMessage());
        try {
          Thread.sleep(RETRY_DELAY_MS * attempt);
        } catch (InterruptedException interrupted) {
          Thread.currentThread().interrupt();
          logger.warn("Overpass update interrupted during retry wait");
          return;
        }
      }
    }
  }

  private boolean isRetryable(Exception e) {
    return e instanceof HttpServerErrorException            // 502/503/504 when Overpass is overloaded
      || e instanceof ResourceAccessException             // timeouts, connection problems
      || (e instanceof HttpClientErrorException client
      && client.getStatusCode().value() == 429);      // rate limited
  }

}
