package com.jetlag.places.importer;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class VoronoiCellBuilderTest {

  private static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), 3006);

  private static boolean contains(Polygon cell, double x, double y) {
    return cell.contains(FACTORY.createPoint(new Coordinate(x, y)));
  }

  @Test
  void givesEachPlaceTheAreaClosestToIt() {
    List<VoronoiCellBuilder.Site> sites = List.of(
      new VoronoiCellBuilder.Site(1, 0, 0),
      new VoronoiCellBuilder.Site(2, 10_000, 0),
      new VoronoiCellBuilder.Site(3, 0, 10_000),
      new VoronoiCellBuilder.Site(4, 10_000, 10_000));

    Map<Long, Polygon> cells = VoronoiCellBuilder.build(sites, 5_000, FACTORY);

    assertThat(cells).containsOnlyKeys(1L, 2L, 3L, 4L);
    for (VoronoiCellBuilder.Site site : sites) {
      assertThat(contains(cells.get(site.id()), site.x(), site.y())).isTrue();
    }
    // Just either side of the line halfway between 1 and 2
    assertThat(contains(cells.get(1L), 4_900, 1_000)).isTrue();
    assertThat(contains(cells.get(2L), 5_100, 1_000)).isTrue();

    // Together the cells cover the places' envelope plus the margin, without overlapping
    Geometry union = FACTORY.buildGeometry(cells.values()).union();
    assertThat(union.getArea()).isCloseTo(20_000.0 * 20_000.0, within(1.0));
    double total = cells.values().stream().mapToDouble(Geometry::getArea).sum();
    assertThat(total).isCloseTo(union.getArea(), within(1.0));
  }

  @Test
  void givesPlacesAtTheSamePositionOneCell() {
    Map<Long, Polygon> cells = VoronoiCellBuilder.build(List.of(
      new VoronoiCellBuilder.Site(7, 0, 0),
      new VoronoiCellBuilder.Site(3, 0, 0),
      new VoronoiCellBuilder.Site(5, 10_000, 0)), 1_000, FACTORY);

    assertThat(cells).containsOnlyKeys(3L, 5L);
  }

  @Test
  void givesALonePlaceTheWholeArea() {
    Map<Long, Polygon> cells = VoronoiCellBuilder.build(List.of(new VoronoiCellBuilder.Site(1, 100, 200)), 1_000, FACTORY);

    assertThat(cells).containsOnlyKeys(1L);
    assertThat(cells.get(1L).getArea()).isCloseTo(2_000.0 * 2_000.0, within(1.0));
  }

  @Test
  void addsVerticesAlongLongEdges() {
    Map<Long, Polygon> cells = VoronoiCellBuilder.build(List.of(
      new VoronoiCellBuilder.Site(1, 0, 0),
      new VoronoiCellBuilder.Site(2, 100_000, 0)), 50_000, FACTORY);

    // Each cell is a 100 km square; edges of at most 2 km need at least 200 vertices
    assertThat(cells.get(1L).getNumPoints()).isGreaterThanOrEqualTo(200);
  }

  @Test
  void buildsNothingWithoutPlaces() {
    assertThat(VoronoiCellBuilder.build(List.of(), 1_000, FACTORY)).isEmpty();
  }
}
