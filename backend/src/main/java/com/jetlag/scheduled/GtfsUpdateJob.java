package com.jetlag.scheduled;

import com.jetlag.service.GtfsStopImportService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GtfsUpdateJob {

  private static final Logger logger =
    LoggerFactory.getLogger(GtfsUpdateJob.class);

  private final GtfsStopImportService importService;

  public GtfsUpdateJob(GtfsStopImportService importService) {
    this.importService = importService;
  }

  @Scheduled(
    initialDelayString = "${gtfs.update.initial-delay-ms:10000}",
    fixedDelayString = "${gtfs.update.fixed-delay-ms:86400000}"
  )
  public void updateStops() {
    logger.info("Starting GTFS stop update");
    try {
      int count = importService.importStops();
      logger.info("GTFS update successful: {} stops imported", count);
    } catch (Exception exception) {
      logger.error(
        "GTFS stop update failed; existing stop data is retained",
        exception);
    }
  }
}
