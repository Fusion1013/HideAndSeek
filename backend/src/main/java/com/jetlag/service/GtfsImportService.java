package com.jetlag.service;

import com.jetlag.domain.*;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.BiFunction;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class GtfsImportService {

  private static final Logger logger =
    LoggerFactory.getLogger(GtfsImportService.class);

  private static final String BASE_URL =
    "https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip";

  private static final int BATCH_SIZE = 1_000;

  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final String apiKey;

  private final StopBatchWriter stopBatchWriter;
  private final RouteBatchWriter routeBatchWriter;
  private final TripBatchWriter tripBatchWriter;
  private final StopTimeBatchWriter stopTimeBatchWriter;
  private final ShapeBatchWriter shapeBatchWriter;
  private final AgencyBatchWriter agencyBatchWriter;

  public GtfsImportService(
    @Value("${trafiklab.api-key}") String apiKey,
    StopBatchWriter stopBatchWriter,
    RouteBatchWriter routeBatchWriter,
    TripBatchWriter tripBatchWriter,
    StopTimeBatchWriter stopTimeBatchWriter,
    ShapeBatchWriter shapeBatchWriter,
    AgencyBatchWriter agencyBatchWriter
  ) {
    this.apiKey = apiKey;
    this.stopBatchWriter = stopBatchWriter;
    this.routeBatchWriter = routeBatchWriter;
    this.tripBatchWriter = tripBatchWriter;
    this.stopTimeBatchWriter = stopTimeBatchWriter;
    this.shapeBatchWriter = shapeBatchWriter;
    this.agencyBatchWriter = agencyBatchWriter;
  }

  public int importData() throws IOException, InterruptedException {
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

      int deletedCount = stopBatchWriter.deleteStale(generation) +
        routeBatchWriter.deleteStale(generation) +
        tripBatchWriter.deleteStale(generation) +
        agencyBatchWriter.deleteStale(generation) +
        stopTimeBatchWriter.deleteStale(generation) +
        shapeBatchWriter.deleteStale(generation);

      logger.info(
        "GTFS import completed. Imported: {}, removed: {}",
        importedCount, deletedCount);

      return importedCount;
    } finally {
      Files.deleteIfExists(zipPath);
    }
  }

  private void downloadDataset(Path zipPath)
    throws IOException, InterruptedException {

    String encodedKey = URLEncoder.encode(
      apiKey, StandardCharsets.UTF_8);

    URI uri = URI.create(BASE_URL + "?key=" + encodedKey);

    HttpRequest request = HttpRequest.newBuilder()
      .uri(uri)
      .header("Accept-Encoding", "gzip")
      .GET()
      .build();

    HttpResponse<Path> response = httpClient.send(
      request,
      HttpResponse.BodyHandlers.ofFile(zipPath));

    if (response.statusCode() != 200) {
      String errorBody = Files.readString(
        zipPath, StandardCharsets.UTF_8);

      throw new IOException(
        "Trafiklab returned HTTP "
          + response.statusCode() + ": " + errorBody);
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
            importedCount += parse("stops", parser, generation, stopBatchWriter, StopEntity::new);
          } else if (fileName.equalsIgnoreCase("routes.txt")) {
            importedCount += parse("routes", parser, generation, routeBatchWriter, RouteEntity::new);
          } else if (fileName.equalsIgnoreCase("trips.txt")) {
            importedCount += parse("trips", parser, generation, tripBatchWriter, TripEntity::new);
          } else if (fileName.equalsIgnoreCase("stop_times.txt")) {
            importedCount += parse("stop_times", parser, generation, stopTimeBatchWriter, StopTimeEntity::new);
          } else if (fileName.equalsIgnoreCase("shapes.txt")) {
            importedCount += parse("shapes", parser, generation, shapeBatchWriter, ShapeEntity::new);
          } else if (fileName.equalsIgnoreCase("agency.txt")) {
            importedCount += parse("agencies", parser, generation, agencyBatchWriter, AgencyEntity::new);
          }
        }
      }
    }

    return importedCount;
  }

  private <T> int parse(String type, CSVParser parser, String generation, IBatchWriter<T> writer, BiFunction<CSVRecord, String, T> entityFactory) {
    List<T> batch = new ArrayList<>();
    int importedCount = 0;
    long nextLogCount = 10_000;

    for (CSVRecord record : parser) {
      T entity = entityFactory.apply(record, generation);
      batch.add(entity);

      if (batch.size() >= BATCH_SIZE) {
        writer.saveBatch(batch);
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
      writer.saveBatch(batch);
      importedCount += batch.size();
    }

    return importedCount;
  }
}
