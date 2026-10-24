package com.jetlag.places.api;

import com.jetlag.places.model.OsmType;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.model.OverpassLocationCategory;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonRawValue;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;

public record OverpassLocationDTO(
  Long id,
  OsmType osmType,
  long osmId,
  OverpassLocationCategory category,
  String subtype,
  String name,
  double latitude,
  double longitude,
  Map<String, String> tags,
  Instant fetchedAt,
  @Schema(implementation = Object.class, types = {"object"},
    description = "GeoJSON geometry in EPSG:4326. Only present when requested and stored for the place.")
  @JsonRawValue
  @JsonInclude(JsonInclude.Include.NON_NULL)
  String geometry) {

  public static OverpassLocationDTO from(OverpassLocationEntity p) {
    return from(p, null);
  }

  /** @param geoJson the place's geometry as a GeoJSON string, or null */
  public static OverpassLocationDTO from(OverpassLocationEntity p, String geoJson) {
    return new OverpassLocationDTO(p.getId(), p.getOsmType(), p.getOsmId(), p.getCategory(),
      p.getSubtype(), p.getName(), p.getLatitude(), p.getLongitude(),
      p.getTags(), p.getFetchedAt(), geoJson);
  }
}
