package com.jetlag.transit.gtfs;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GtfsUpdateJob {

  private static final Logger logger =
    LoggerFactory.getLogger(GtfsUpdateJob.class);

  private final GtfsImportService importService;

  public GtfsUpdateJob(GtfsImportService importService) {
    this.importService = importService;
  }

  // cron = "0 0 0 * * *"
//  @Scheduled(
//    initialDelayString = "${gtfs.update.initial-delay-ms:10000}",
//    fixedDelayString = "${gtfs.update.fixed-delay-ms:86400000}"
//  )
  public void updateAll() {
    logger.info("Starting GTFS update");
    try {
      int count = importService.importData();
      logger.info("GTFS update successful: {} entries imported", count);
    } catch (Exception exception) {
      logger.error(
        "GTFS update failed; existing data is retained",
        exception);
    }
  }
}
