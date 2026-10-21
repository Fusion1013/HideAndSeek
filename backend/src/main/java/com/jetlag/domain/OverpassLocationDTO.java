package com.jetlag.domain;

import com.jetlag.util.OsmType;
import com.jetlag.util.OverpassLocationCategory;

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
  Instant fetchedAt) {

  public static OverpassLocationDTO from(OverpassLocation p) {
    return new OverpassLocationDTO(p.getId(), p.getOsmType(), p.getOsmId(), p.getCategory(),
      p.getSubtype(), p.getName(), p.getLatitude(), p.getLongitude(),
      p.getTags(), p.getFetchedAt());
  }
}
