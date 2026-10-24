package com.jetlag.places.importer;

import com.jetlag.places.model.OsmType;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.geom.util.GeometryFixer;
import org.locationtech.jts.operation.polygonize.Polygonizer;

import java.util.*;

/** Converts Overpass {@code out geom} elements into JTS geometries (SRID 4326, x = lon, y = lat). */
final class OverpassGeometryBuilder {

  private static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), 4326);

  /** Tags that make a closed way a line rather than an area, unless area=yes. */
  private static final Set<String> LINEAR_KEYS = Set.of("highway", "railway", "barrier", "waterway", "power");

  private OverpassGeometryBuilder() {}

  public static Optional<Geometry> build(OverpassResponse.Element e) {
    if (e.type() == null) return Optional.empty();
    Map<String, String> tags = e.tags() == null ? Map.of() : e.tags();
    Geometry geometry = switch (OsmType.fromOverpass(e.type())) {
      case NODE -> e.lat() == null || e.lon() == null ? null
        : FACTORY.createPoint(new Coordinate(e.lon(), e.lat()));
      case WAY -> buildWay(e.geometry(), tags);
      case RELATION -> buildRelation(e.members(), tags);
    };
    if (geometry == null || geometry.isEmpty()) return Optional.empty();
    if (!geometry.isValid()) geometry = GeometryFixer.fix(geometry);
    geometry.setSRID(4326);
    return Optional.of(geometry);
  }

  /** A representative point that is guaranteed to lie on the geometry. */
  public static OverpassResponse.Center center(Geometry geometry) {
    Point p = geometry.getInteriorPoint();
    return new OverpassResponse.Center(p.getY(), p.getX());
  }

  private static Geometry buildWay(List<OverpassResponse.LatLon> points, Map<String, String> tags) {
    Coordinate[] coords = toCoordinates(points);
    if (coords.length < 2) return null;
    boolean closed = coords.length >= 4 && coords[0].equals2D(coords[coords.length - 1]);
    if (closed && isArea(tags)) {
      return FACTORY.createPolygon(coords);
    }
    return FACTORY.createLineString(coords);
  }

  private static boolean isArea(Map<String, String> tags) {
    String area = tags.get("area");
    if ("yes".equals(area)) return true;
    if ("no".equals(area)) return false;
    if ("coastline".equals(tags.get("natural"))) return false;
    return LINEAR_KEYS.stream().noneMatch(tags::containsKey);
  }

  private static Geometry buildRelation(List<OverpassResponse.Member> members, Map<String, String> tags) {
    if (members == null) return null;
    String type = tags.get("type");
    if ("multipolygon".equals(type) || "boundary".equals(type)) {
      Geometry polygons = buildMultipolygon(members);
      if (polygons != null) return polygons;
    }
    // Fall back to the raw member ways, e.g. for routes or incomplete multipolygons
    LineString[] lines = members.stream()
      .filter(m -> "way".equals(m.type()))
      .map(m -> toCoordinates(m.geometry()))
      .filter(c -> c.length >= 2)
      .map(FACTORY::createLineString)
      .toArray(LineString[]::new);
    return lines.length == 0 ? null : FACTORY.createMultiLineString(lines);
  }

  private static Geometry buildMultipolygon(List<OverpassResponse.Member> members) {
    List<LineString> outer = new ArrayList<>();
    List<LineString> inner = new ArrayList<>();
    for (OverpassResponse.Member m : members) {
      if (!"way".equals(m.type())) continue;
      Coordinate[] coords = toCoordinates(m.geometry());
      if (coords.length < 2) continue;
      // An empty role is treated as outer, per OSM convention
      ("inner".equals(m.role()) ? inner : outer).add(FACTORY.createLineString(coords));
    }
    Geometry outerArea = polygonize(outer);
    if (outerArea == null) return null;
    Geometry innerArea = polygonize(inner);
    return innerArea == null ? outerArea : outerArea.difference(innerArea);
  }

  /** Assembles ways that share endpoints into polygons, or null if no closed ring can be formed. */
  private static Geometry polygonize(List<LineString> lines) {
    if (lines.isEmpty()) return null;
    Polygonizer polygonizer = new Polygonizer(true);
    polygonizer.add(lines);
    Geometry result = polygonizer.getGeometry();
    return result.isEmpty() ? null : result;
  }

  private static Coordinate[] toCoordinates(List<OverpassResponse.LatLon> points) {
    if (points == null) return new Coordinate[0];
    return points.stream()
      .filter(Objects::nonNull)
      .map(p -> new Coordinate(p.lon(), p.lat()))
      .toArray(Coordinate[]::new);
  }
}
