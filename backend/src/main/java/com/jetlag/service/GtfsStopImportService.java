package com.jetlag.service;

import com.jetlag.domain.StopEntity;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class GtfsStopImportService {

  private static final Logger logger =
    LoggerFactory.getLogger(GtfsStopImportService.class);

  private static final String BASE_URL =
    "https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip";

  private static final int BATCH_SIZE = 1_000;

  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final String apiKey;
  private final StopBatchWriter batchWriter;

  public GtfsStopImportService(
    @Value("${trafiklab.api-key}") String apiKey,
    StopBatchWriter batchWriter) {
    this.apiKey = apiKey;
    this.batchWriter = batchWriter;
  }

  public int importStops() throws IOException, InterruptedException {
    String generation = UUID.randomUUID().toString();

    Path zipPath = Files.createTempFile("gtfs-sweden-", ".zip");

    try {
      downloadDataset(zipPath);

      int importedCount = parseAndImportStops(
        zipPath, generation);

      if (importedCount == 0) {
        throw new IOException(
          "No stops were imported; existing data was preserved.");
      }

      int deletedCount =
        batchWriter.deleteStaleStops(generation);

      logger.info(
        "GTFS stops import completed. Imported: {}, removed: {}",
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

  private int parseAndImportStops(
    Path zipPath,
    String generation) throws IOException {

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

        if (!fileName.equalsIgnoreCase("stops.txt")) {
          continue;
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

          List<StopEntity> batch =
            new ArrayList<>(BATCH_SIZE);

          int importedCount = 0;

          for (CSVRecord record : parser) {
            StopEntity stop = mapStop(record, generation);
            batch.add(stop);

            if (batch.size() >= BATCH_SIZE) {
              batchWriter.saveBatch(batch);
              importedCount += batch.size();
              batch.clear();

              logger.info(
                "Imported {} GTFS stops so far",
                importedCount);
            }
          }

          if (!batch.isEmpty()) {
            batchWriter.saveBatch(batch);
            importedCount += batch.size();
          }

          return importedCount;
        }
      }
    }

    throw new IOException(
      "The downloaded archive does not contain stops.txt");
  }

  private StopEntity mapStop(
    CSVRecord record,
    String generation) throws IOException {

    StopEntity stop = new StopEntity();

    stop.setStopId(required(record, "stop_id"));
    stop.setStopCode(optional(record, "stop_code"));
    stop.setStopName(optional(record, "stop_name"));
    stop.setStopDescription(optional(record, "stop_desc"));
    stop.setLatitude(decimal(record, "stop_lat"));
    stop.setLongitude(decimal(record, "stop_lon"));
    stop.setZoneId(optional(record, "zone_id"));
    stop.setStopUrl(optional(record, "stop_url"));
    stop.setLocationType(integer(record, "location_type"));
    stop.setParentStation(optional(record, "parent_station"));
    stop.setWheelchairBoarding(
      integer(record, "wheelchair_boarding"));
    stop.setLevelId(optional(record, "level_id"));
    stop.setPlatformCode(optional(record, "platform_code"));
    stop.setImportGeneration(generation);

    return stop;
  }

  private String required(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      throw new IOException(
        "Missing required value '" + column
          + "' on GTFS row " + record.getRecordNumber());
    }

    return value;
  }

  private String optional(CSVRecord record, String column) {
    // A UTF-8 BOM may appear at the start of the first header.
    String actualColumn = record.getParser()
      .getHeaderMap()
      .keySet()
      .stream()
      .filter(header ->
        header.replace("\uFEFF", "").equals(column))
      .findFirst()
      .orElse(column);

    if (!record.isMapped(actualColumn)) {
      return null;
    }

    String value = record.get(actualColumn);
    return value == null || value.isBlank() ? null : value;
  }

  private Double decimal(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      return null;
    }

    try {
      double parsed = Double.parseDouble(value);

      if (!Double.isFinite(parsed)) {
        throw new NumberFormatException("Non-finite coordinate");
      }

      return parsed;
    } catch (NumberFormatException exception) {
      throw new IOException(
        "Invalid " + column + " on GTFS row "
          + record.getRecordNumber() + ": " + value,
        exception);
    }
  }

  private Integer integer(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      return null;
    }

    try {
      return Integer.valueOf(value);
    } catch (NumberFormatException exception) {
      throw new IOException(
        "Invalid " + column + " on GTFS row "
          + record.getRecordNumber() + ": " + value,
        exception);
    }
  }
}
