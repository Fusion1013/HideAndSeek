package com.jetlag.service;

import com.jetlag.domain.GtfsDataset;
import com.jetlag.domain.GtfsRow;
import com.jetlag.domain.GtfsTable;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class GtfsStaticDataService {

  private static final String BASE_URL =
    "https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip";

  private static final Map<String, String> ID_COLUMNS = Map.ofEntries(
    Map.entry("agency", "agency_id"),
    Map.entry("stops", "stop_id"),
    Map.entry("routes", "route_id"),
    Map.entry("trips", "trip_id"),
    Map.entry("calendar", "service_id"),
    Map.entry("calendar_dates", "service_id"),
    Map.entry("shapes", "shape_id"),
    Map.entry("levels", "level_id"),
    Map.entry("pathways", "pathway_id"),
    Map.entry("areas", "area_id"),
    Map.entry("stop_areas", "area_id"),
    Map.entry("fare_attributes", "fare_id"),
    Map.entry("fare_products", "fare_product_id"),
    Map.entry("fare_media", "fare_media_id"),
    Map.entry("fare_leg_rules", "leg_group_id"),
    Map.entry("fare_transfer_rules", "from_leg_group_id"),
    Map.entry("translations", "table_name")
  );

  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final String apiKey;
  private final AtomicReference<GtfsDataset> currentDataset =
    new AtomicReference<>();

  public GtfsStaticDataService(
    @Value("${trafiklab.api-key}") String apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Returns the cached dataset, downloading it on first access.
   */
  public GtfsDataset getDataset()
    throws IOException, InterruptedException {

    GtfsDataset dataset = currentDataset.get();

    if (dataset != null) {
      return dataset;
    }

    synchronized (currentDataset) {
      dataset = currentDataset.get();

      if (dataset == null) {
        dataset = downloadAndParse();
        currentDataset.set(dataset);
      }
    }

    return dataset;
  }

  /**
   * Downloads and parses a fresh copy of the dataset.
   * The previous dataset remains available if refreshing fails.
   */
  public synchronized GtfsDataset refresh()
    throws IOException, InterruptedException {

    GtfsDataset newDataset = downloadAndParse();
    currentDataset.set(newDataset);
    return newDataset;
  }

  private GtfsDataset downloadAndParse()
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
      HttpResponse.BodyHandlers.ofFile(
        Files.createTempFile("gtfs-sweden-", ".zip")
      )
    );

    Path zipPath = response.body();

    try {
      if (response.statusCode() != 200) {
        String errorBody = Files.readString(
          zipPath, StandardCharsets.UTF_8);

        throw new IOException(
          "Trafiklab returned HTTP "
            + response.statusCode()
            + ": " + errorBody
        );
      }

      return parseZip(zipPath);
    } finally {
      Files.deleteIfExists(zipPath);
    }
  }

  private GtfsDataset parseZip(Path zipPath)
    throws IOException {

    Map<String, GtfsTable> tables = new LinkedHashMap<>();

    try (ZipFile zipFile = new ZipFile(
      zipPath.toFile(), StandardCharsets.UTF_8)) {

      Enumeration<? extends ZipEntry> entries =
        zipFile.entries();

      while (entries.hasMoreElements()) {
        ZipEntry entry = entries.nextElement();

        if (entry.isDirectory()
          || !entry.getName().toLowerCase(Locale.ROOT)
          .endsWith(".txt")) {
          continue;
        }

        String fileName = entry.getName();
        int separator = fileName.lastIndexOf('/');
        if (separator >= 0) {
          fileName = fileName.substring(separator + 1);
        }

        String tableName = fileName.substring(
          0, fileName.length() - 4);

        if ("stop_times".equals(tableName)) {
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

          List<GtfsRow> rows = new ArrayList<>();

          for (CSVRecord record : parser) {
            Map<String, String> values =
              new LinkedHashMap<>();

            for (String column : parser.getHeaderNames()) {
              values.put(column, record.get(column));
            }

            rows.add(new GtfsRow(values));
          }

          String idColumn = ID_COLUMNS.get(tableName);

          // Unknown tables are still loaded in full.
          // They simply do not receive a default ID index.
          tables.put(
            tableName,
            new GtfsTable(tableName, idColumn, rows)
          );
        }
      }
    }

    if (tables.isEmpty()) {
      throw new IOException(
        "No GTFS .txt tables found in the downloaded ZIP");
    }

    return new GtfsDataset(tables, Instant.now());
  }
}
