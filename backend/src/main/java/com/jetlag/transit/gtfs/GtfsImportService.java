package com.jetlag.transit.gtfs;

import com.jetlag.config.TrafiklabProperties;
import com.jetlag.transit.repository.AgencyRepository;
import com.jetlag.transit.repository.GtfsRepository;
import com.jetlag.transit.repository.RouteRepository;
import com.jetlag.transit.repository.ShapeRepository;
import com.jetlag.transit.repository.StopRepository;
import com.jetlag.transit.repository.StopTimeRepository;
import com.jetlag.transit.repository.TripRepository;
import com.jetlag.transit.model.AgencyEntity;
import com.jetlag.transit.model.RouteEntity;
import com.jetlag.transit.model.StopEntity;
import com.jetlag.transit.model.StopTimeEntity;
import com.jetlag.transit.model.TripEntity;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.function.BiFunction;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class GtfsImportService {

  private static final Logger logger =
    LoggerFactory.getLogger(GtfsImportService.class);

  private static final String DATASET_PATH = "/gtfs-sweden/sweden.zip";

  private static final int BATCH_SIZE = 1_000;

  private final RestClient trafiklab;
  private final TrafiklabProperties properties;
  private final GtfsBatchWriter batchWriter;
  private final RouteStopsView routeStopsView;
  private final ShapeLineImporter shapeLineImporter;

  private final StopRepository stopRepository;
  private final RouteRepository routeRepository;
  private final TripRepository tripRepository;
  private final StopTimeRepository stopTimeRepository;
  private final ShapeRepository shapeRepository;
  private final AgencyRepository agencyRepository;

  public GtfsImportService(
    @Qualifier("trafiklabRestClient") RestClient trafiklab,
    TrafiklabProperties properties,
    GtfsBatchWriter batchWriter,
    RouteStopsView routeStopsView,
    ShapeLineImporter shapeLineImporter,
    StopRepository stopRepository,
    RouteRepository routeRepository,
    TripRepository tripRepository,
    StopTimeRepository stopTimeRepository,
    ShapeRepository shapeRepository,
    AgencyRepository agencyRepository
  ) {
    this.trafiklab = trafiklab;
    this.properties = properties;
    this.batchWriter = batchWriter;
    this.routeStopsView = routeStopsView;
    this.shapeLineImporter = shapeLineImporter;
    this.stopRepository = stopRepository;
    this.routeRepository = routeRepository;
    this.tripRepository = tripRepository;
    this.stopTimeRepository = stopTimeRepository;
    this.shapeRepository = shapeRepository;
    this.agencyRepository = agencyRepository;
  }

  public int importData() throws IOException {
    String generation = UUID.randomUUID().toString();

    Path zipPath = Files.createTempFile("gtfs-sweden-", ".zip");

    try {
      downloadDataset(zipPath);

      int importedCount = parseAndImport(
        zipPath, generation);

      if (importedCount == 0) {
        throw new IOException(
          "No entities were imported; existing data was preserved.");
      }

      int deletedCount = batchWriter.deleteStale(stopRepository, generation) +
        batchWriter.deleteStale(routeRepository, generation) +
        batchWriter.deleteStale(tripRepository, generation) +
        batchWriter.deleteStale(agencyRepository, generation) +
        batchWriter.deleteStale(stopTimeRepository, generation) +
        batchWriter.deleteStale(shapeRepository, generation);

      routeStopsView.refresh();

      logger.info(
        "GTFS import completed. Imported: {}, removed: {}",
        importedCount, deletedCount);

      return importedCount;
    } finally {
      Files.deleteIfExists(zipPath);
    }
  }

  private void downloadDataset(Path zipPath) throws IOException {
    HttpStatusCode status = trafiklab.get()
      .uri(uri -> uri.path(DATASET_PATH).queryParam("key", properties.staticApiKey()).build())
      .header(HttpHeaders.ACCEPT_ENCODING, "gzip")
      .exchange((request, response) -> {
        Files.copy(response.getBody(), zipPath, StandardCopyOption.REPLACE_EXISTING);
        return response.getStatusCode();
      });

    if (!status.is2xxSuccessful()) {
      String errorBody = Files.readString(zipPath, StandardCharsets.UTF_8);
      throw new IOException("Trafiklab returned HTTP " + status.value() + ": " + errorBody);
    }
  }

  private int parseAndImport(
    Path zipPath,
    String generation) throws IOException {

    int importedCount = 0;

    try (ZipFile zipFile = new ZipFile(
      zipPath.toFile(), StandardCharsets.UTF_8)) {

      var entries = zipFile.entries();

      while (entries.hasMoreElements()) {
        ZipEntry entry = entries.nextElement();

        if (entry.isDirectory()) {
          continue;
        }

        String fileName = entry.getName();
        int separator = fileName.lastIndexOf('/');

        if (separator >= 0) {
          fileName = fileName.substring(separator + 1);
        }

        try (InputStream inputStream =
               zipFile.getInputStream(entry);
             Reader reader = new InputStreamReader(
               inputStream, StandardCharsets.UTF_8);
             CSVParser parser = CSVFormat.DEFAULT.builder()
               .setHeader()
               .setSkipHeaderRecord(true)
               .setIgnoreEmptyLines(true)
               .get()
               .parse(reader)) {
          if (fileName.equalsIgnoreCase("stops.txt")) {
            importedCount += parse("stops", parser, generation, stopRepository, StopEntity::new);
          } else if (fileName.equalsIgnoreCase("routes.txt")) {
            importedCount += parse("routes", parser, generation, routeRepository, RouteEntity::new);
          } else if (fileName.equalsIgnoreCase("trips.txt")) {
            importedCount += parse("trips", parser, generation, tripRepository, TripEntity::new);
          } else if (fileName.equalsIgnoreCase("stop_times.txt")) {
            importedCount += parse("stop_times", parser, generation, stopTimeRepository, StopTimeEntity::new);
          } else if (fileName.equalsIgnoreCase("shapes.txt")) {
            importedCount += shapeLineImporter.importShapes(parser, generation);
          } else if (fileName.equalsIgnoreCase("agency.txt")) {
            importedCount += parse("agencies", parser, generation, agencyRepository, AgencyEntity::new);
          }
        }
      }
    }

    return importedCount;
  }

  private <T> int parse(String type, CSVParser parser, String generation, GtfsRepository<T, ?> repository, BiFunction<CSVRecord, String, T> entityFactory) {
    List<T> batch = new ArrayList<>();
    int importedCount = 0;
    long nextLogCount = 10_000;

    for (CSVRecord record : parser) {
      T entity = entityFactory.apply(record, generation);
      batch.add(entity);

      if (batch.size() >= BATCH_SIZE) {
        batchWriter.saveBatch(repository, batch);
        importedCount += batch.size();
        batch.clear();

        if (importedCount >= nextLogCount) {
          logger.info(
            "Imported {} GTFS {} so far",
            importedCount, type);

          nextLogCount = ((importedCount / 10_000) + 1) * 10_000L;
        }
      }
    }

    if (!batch.isEmpty()) {
      batchWriter.saveBatch(repository, batch);
      importedCount += batch.size();
    }

    return importedCount;
  }
}
