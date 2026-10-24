package com.jetlag.places.importer;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Polygon;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class OverpassGeometryBuilderTest {

  private static OverpassResponse.LatLon at(double lat, double lon) {
    return new OverpassResponse.LatLon(lat, lon);
  }

  private static final List<OverpassResponse.LatLon> SQUARE =
    List.of(at(0, 0), at(0, 10), at(10, 10), at(10, 0), at(0, 0));

  private static OverpassResponse.Element way(Map<String, String> tags, List<OverpassResponse.LatLon> points) {
    return new OverpassResponse.Element("way", 1, null, null, null, tags, points, null);
  }

  @Test
  void buildsPointsWithLongitudeAsX() {
    var node = new OverpassResponse.Element("node", 1, 57.7, 11.9, null, Map.of(), null, null);

    Geometry geometry = OverpassGeometryBuilder.build(node).orElseThrow();

    assertThat(geometry.getGeometryType()).isEqualTo("Point");
    assertThat(geometry.getCoordinate().x).isEqualTo(11.9);
    assertThat(geometry.getCoordinate().y).isEqualTo(57.7);
    assertThat(geometry.getSRID()).isEqualTo(4326);
  }

  @Test
  void treatsClosedWaysAsAreasUnlessTaggedAsLines() {
    assertThat(OverpassGeometryBuilder.build(way(Map.of("leisure", "park"), SQUARE)).orElseThrow())
      .isInstanceOf(Polygon.class);
    assertThat(OverpassGeometryBuilder.build(way(Map.of("natural", "coastline"), SQUARE)).orElseThrow().getGeometryType())
      .isEqualTo("LineString");
    assertThat(OverpassGeometryBuilder.build(way(Map.of("railway", "rail"), SQUARE)).orElseThrow().getGeometryType())
      .isEqualTo("LineString");
    assertThat(OverpassGeometryBuilder.build(way(Map.of("railway", "rail", "area", "yes"), SQUARE)).orElseThrow())
      .isInstanceOf(Polygon.class);
  }

  @Test
  void assemblesMultipolygonsFromOuterAndInnerWays() {
    var outerHalf1 = List.of(at(0, 0), at(0, 10), at(10, 10));
    var outerHalf2 = List.of(at(10, 10), at(10, 0), at(0, 0));
    var hole = List.of(at(2, 2), at(2, 4), at(4, 4), at(4, 2), at(2, 2));
    var relation = new OverpassResponse.Element("relation", 1, null, null, null, Map.of("type", "boundary"), null, List.of(
      new OverpassResponse.Member("way", 1, "outer", outerHalf1),
      new OverpassResponse.Member("way", 2, "outer", outerHalf2),
      new OverpassResponse.Member("way", 3, "inner", hole),
      new OverpassResponse.Member("node", 4, "admin_centre", null)));

    Geometry geometry = OverpassGeometryBuilder.build(relation).orElseThrow();

    assertThat(geometry).isInstanceOf(Polygon.class);
    assertThat(((Polygon) geometry).getNumInteriorRing()).isEqualTo(1);
    assertThat(geometry.getArea()).isEqualTo(100 - 4);
  }

  @Test
  void fallsBackToLinesWhenNoRingCloses() {
    var relation = new OverpassResponse.Element("relation", 1, null, null, null, Map.of("type", "route"), null, List.of(
      new OverpassResponse.Member("way", 1, "", List.of(at(0, 0), at(0, 1))),
      new OverpassResponse.Member("way", 2, "", List.of(at(0, 1), at(1, 1)))));

    assertThat(OverpassGeometryBuilder.build(relation).orElseThrow().getGeometryType()).isEqualTo("MultiLineString");
  }

  @Test
  void centerLiesOnTheGeometry() {
    Geometry ring = OverpassGeometryBuilder.build(way(Map.of("leisure", "park"), SQUARE)).orElseThrow();

    var center = OverpassGeometryBuilder.center(ring);

    assertThat(ring.contains(ring.getFactory().createPoint(
      new org.locationtech.jts.geom.Coordinate(center.lon(), center.lat())))).isTrue();
  }

  @Test
  void returnsEmptyForElementsWithoutGeometry() {
    assertThat(OverpassGeometryBuilder.build(way(Map.of(), null))).isEmpty();
    assertThat(OverpassGeometryBuilder.build(new OverpassResponse.Element("node", 1, null, null, null, null, null, null)))
      .isEmpty();
  }
}
