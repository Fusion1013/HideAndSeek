package com.jetlag.places.model;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import static com.jetlag.places.model.TagFilter.of;
import static com.jetlag.places.model.TagFilter.exists;

public enum OverpassLocationCategory {

  // Transport
  COMMERCIAL_AIRPORT("nwr", null, of("aeroway", "aerodrome"), exists("iata")),
  HIGH_SPEED_RAIL_LINE("way", null, OutMode.GEOM, of("railway", "rail"), of("highspeed", "yes")),
  RAIL_STATION("nwr", null, of("railway", "station")),

  // Administrative boundaries
  ADMIN_DIVISION_1("relation", "admin_level", OutMode.GEOM,
    of("boundary", "administrative"), of("admin_level", AdminLevels.DIVISION_1)),
  ADMIN_DIVISION_2("relation", "admin_level", OutMode.GEOM,
    of("boundary", "administrative"), of("admin_level", AdminLevels.DIVISION_2)),
  ADMIN_DIVISION_4("relation", "admin_level", OutMode.GEOM,
    of("boundary", "administrative"), of("admin_level", AdminLevels.DIVISION_4)),

  // Nature
  BODY_OF_WATER("nwr", "water", OutMode.GEOM, of("natural", "water"), exists("name")),
  COASTLINE("way", null, OutMode.GEOM, of("natural", "coastline")),
  MOUNTAIN("nwr", null, of("natural", "peak")),
  PARK("nwr", null, of("leisure", "park")),

  // Attractions and facilities
  ZOO("nwr", null, of("tourism", "zoo")),
  AQUARIUM("nwr", null, of("tourism", "aquarium")),
  GOLF_COURSE("nwr", null, of("leisure", "golf_course")),
  MUSEUM("nwr", null, of("tourism", "museum")),
  MOVIE_THEATRE("nwr", null, of("amenity", "cinema")),
  HOSPITAL("nwr", null, of("amenity", "hospital")),
  LIBRARY("nwr", null, of("amenity", "library")),
  FOREIGN_CONSULATE("nwr", null, of("office", "diplomatic"), of("diplomatic", "consulate")),

  /** Fallback for elements that match nothing; not searchable. */
  OTHER("nwr", null);

  private final String selector;       // nwr | node | way | relation
  private final String subtypeKey;     // tag whose value is stored as Place.subtype, may be null
  private final TagFilter[] filters;
  private final OutMode outMode;

  OverpassLocationCategory(String selector, String subtypeKey, TagFilter... filters) {
    this(selector, subtypeKey, OutMode.CENTER, filters);
  }

  OverpassLocationCategory(String selector, String subtypeKey, OutMode outMode, TagFilter... filters) {
    this.selector = selector;
    this.subtypeKey = subtypeKey;
    this.filters = filters;
    this.outMode = outMode;
  }

  public boolean isSearchable() {
    return filters.length > 0;
  }

  /** Overpass statement for this category inside a named area, e.g. nwr(area.a)["amenity"="cinema"]; */
  public String overpassStatement(String areaVar) {
    if (!isSearchable()) throw new IllegalStateException(name() + " is not searchable");
    String tagFilters = Arrays.stream(filters)
      .map(TagFilter::toOverpass)
      .collect(Collectors.joining());
    return "%s(area.%s)%s;".formatted(selector, areaVar, tagFilters);
  }

  private boolean matches(Map<String, String> tags) {
    return isSearchable() && Arrays.stream(filters).allMatch(f -> f.matches(tags));
  }

  public String subtype(Map<String, String> tags) {
    return subtypeKey == null ? null : tags.get(subtypeKey);
  }

  public static List<OverpassLocationCategory> searchableCategories() {
    return Arrays.stream(values()).filter(OverpassLocationCategory::isSearchable).toList();
  }

  public static OverpassLocationCategory from(Map<String, String> tags) {
    if (tags != null) {
      for (OverpassLocationCategory c : values()) {
        if (c.matches(tags)) return c;
      }
    }
    return OTHER;
  }

  public boolean hasGeometry() { return outMode == OutMode.GEOM; }
  public String outStatement() { return outMode.statement(); }
}
