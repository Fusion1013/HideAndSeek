package com.jetlag;

import com.google.transit.realtime.GtfsRealtime;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

public class VehiclePositionClient {

  private static final String BASE_URL =
    "https://opendata.samtrafiken.se/gtfs-rt-sweden/";

  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final ObjectMapper objectMapper = new ObjectMapper();

  public List<VehiclePosition> getVehiclePositions(
    String operator,
    String apiKey
  ) throws IOException, InterruptedException {

    String encodedKey = URLEncoder.encode(
      apiKey, StandardCharsets.UTF_8
    );

    URI uri = URI.create(
      BASE_URL + operator
        + "/VehiclePositionsSweden.pb?key="
        + apiKey
    );

    HttpRequest request = HttpRequest.newBuilder()
      .uri(uri)
      .header("Accept-Encoding", "gzip")
      .GET()
      .build();

    HttpResponse<byte[]> response = httpClient.send(
      request,
      HttpResponse.BodyHandlers.ofByteArray()
    );

    if (response.statusCode() != 200) {
      String body = new String(
        response.body(),
        StandardCharsets.UTF_8
      );
      throw new IOException(
        "Trafiklab returned HTTP "
          + response.statusCode() + ": " + body
      );
    }

    byte[] responseBody = response.body();

    String contentEncoding = response.headers()
      .firstValue("Content-Encoding")
      .orElse("identity");

    System.out.println("Content-Encoding: " + contentEncoding);
    System.out.println("Received bytes: " + responseBody.length);

    switch (contentEncoding.toLowerCase(java.util.Locale.ROOT)) {
      case "gzip" -> {
        try (GZIPInputStream gzip = new GZIPInputStream(
          new ByteArrayInputStream(responseBody))) {
          responseBody = gzip.readAllBytes();
        }
      }
      case "deflate" -> {
        try (InflaterInputStream inflater = new InflaterInputStream(
          new ByteArrayInputStream(responseBody))) {
          responseBody = inflater.readAllBytes();
        }
      }
      case "", "identity" -> {
        // The response is already uncompressed.
      }
      default -> throw new IOException(
        "Unsupported Content-Encoding: " + contentEncoding
      );
    }

    System.out.println("Decoded bytes: " + responseBody.length);

    GtfsRealtime.FeedMessage feed =
      GtfsRealtime.FeedMessage.parseFrom(
        responseBody
      );

    List<VehiclePosition> vehicles = new ArrayList<>();

    for (GtfsRealtime.FeedEntity entity : feed.getEntityList()) {
      if (!entity.hasVehicle()) {
        continue;
      }

      GtfsRealtime.VehiclePosition vehicle =
        entity.getVehicle();

      if (!vehicle.hasPosition()) {
        continue;
      }

      GtfsRealtime.Position position =
        vehicle.getPosition();

      String id = entity.getId();
      String tripId = null;
      String routeId = null;

      if (vehicle.hasVehicle()
        && vehicle.getVehicle().hasId()) {
        id = vehicle.getVehicle().getId();
      }

      if (vehicle.hasTrip()) {
        GtfsRealtime.TripDescriptor trip =
          vehicle.getTrip();

        if (trip.hasTripId()) {
          tripId = trip.getTripId();
        }

        if (trip.hasRouteId()) {
          routeId = trip.getRouteId();
        }
      }

      Double bearing = position.hasBearing()
        ? (double) position.getBearing()
        : null;

      Double speed = position.hasSpeed()
        ? (double) position.getSpeed()
        : null;

      Instant timestamp = vehicle.hasTimestamp()
        ? Instant.ofEpochSecond(vehicle.getTimestamp())
        : null;

      vehicles.add(new VehiclePosition(
        id,
        tripId,
        routeId,
        position.getLatitude(),
        position.getLongitude(),
        bearing,
        speed,
        timestamp
      ));
    }

    return vehicles;
  }

  public static void main(String[] args) throws Exception {
    String apiKey = System.getenv("TRAFIKLAB_API_KEY");

    if (apiKey == null || apiKey.isBlank()) {
      apiKey = "ac323a81f3804340b9eac55377fc7ffe";
    }

    String operator = args.length > 0 ? args[0] : "jlt";

    VehiclePositionClient client = new VehiclePositionClient();

    List<VehiclePosition> vehicles =
      client.getVehiclePositions(operator, apiKey);

    ObjectMapper mapper = new ObjectMapper();
//        mapper.findAndRegisterModules();

    System.out.println(
      mapper.writerWithDefaultPrettyPrinter()
        .writeValueAsString(vehicles)
    );

    System.out.println("Vehicles found: " + vehicles.size());
  }
}
