package com.jetlag.transit.realtime;

import com.google.transit.realtime.GtfsRealtime;
import com.jetlag.config.TrafiklabProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

/** Reads current vehicle positions from Trafiklab's GTFS Realtime feed for the configured operator. */
@Component
class VehiclePositionClient {

  private final RestClient trafiklab;
  private final TrafiklabProperties properties;

  VehiclePositionClient(@Qualifier("trafiklabRestClient") RestClient trafiklab, TrafiklabProperties properties) {
    this.trafiklab = trafiklab;
    this.properties = properties;
  }

  List<VehiclePosition> getVehiclePositions() throws IOException {
    ResponseEntity<byte[]> response = trafiklab.get()
      .uri(uri -> uri
        .path("/gtfs-rt-sweden/{operator}/VehiclePositionsSweden.pb")
        .queryParam("key", properties.realtimeApiKey())
        .build(properties.realtimeOperator()))
      .header(HttpHeaders.ACCEPT_ENCODING, "gzip")
      .retrieve()
      .toEntity(byte[].class);

    byte[] responseBody = decode(response);
    GtfsRealtime.FeedMessage feed = GtfsRealtime.FeedMessage.parseFrom(responseBody);

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

  /** The feed is sent compressed when asked to; the HTTP client leaves decompressing to us. */
  private static byte[] decode(ResponseEntity<byte[]> response) throws IOException {
    byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
    String contentEncoding = response.getHeaders().getFirst(HttpHeaders.CONTENT_ENCODING);

    switch (contentEncoding == null ? "" : contentEncoding.toLowerCase(Locale.ROOT)) {
      case "gzip" -> {
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(body))) {
          return gzip.readAllBytes();
        }
      }
      case "deflate" -> {
        try (InflaterInputStream inflater = new InflaterInputStream(new ByteArrayInputStream(body))) {
          return inflater.readAllBytes();
        }
      }
      case "", "identity" -> {
        return body;
      }
      default -> throw new IOException("Unsupported Content-Encoding: " + contentEncoding);
    }
  }
}
