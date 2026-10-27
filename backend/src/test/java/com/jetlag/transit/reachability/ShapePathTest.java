package com.jetlag.transit.reachability;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ShapePathTest {

  /** About 0.009 degrees of latitude per kilometre. */
  private static final double KM = 1 / 111.195;

  @Test
  void cutsTheShapeWhereTheStopsLieBesideIt() {
    List<ShapePath.Point> shape = List.of(point(0, 0), point(1, 0), point(2, 0), point(3, 0));
    // Stops 20 m beside the line, at 0.5 and 2.5 km
    List<ShapePath.Point> path = ShapePath.between(shape, List.of(point(0.5, 0.02), point(2.5, 0.02)));

    assertThat(path).hasSize(4);
    assertThat(path.getFirst().latitude()).isCloseTo(59.0 + 0.5 * KM, within(1e-7));
    assertThat(path.getFirst().longitude()).isCloseTo(18.0, within(1e-7));
    assertThat(path.get(1)).isEqualTo(point(1, 0));
    assertThat(path.getLast().latitude()).isCloseTo(59.0 + 2.5 * KM, within(1e-7));
  }

  @Test
  void takesTheRightPassOfAShapeThatGoesOutAndBack() {
    // Out 2 km north and back along the same street
    List<ShapePath.Point> shape = List.of(point(0, 0), point(2, 0), point(0, 0));
    // From 0.5 km out to 1.5 km on the way back: past the turn, not straight along the first pass
    List<ShapePath.Point> path = ShapePath.between(shape,
      List.of(point(0.5, 0), point(1.9, 0), point(1.5, 0)));

    assertThat(path).isNotNull();
    assertThat(path).contains(point(2, 0));
    assertThat(path.getLast().latitude()).isCloseTo(59.0 + 1.5 * KM, within(1e-7));
  }

  @Test
  void hasNoPathWhenAStopIsFarFromTheShape() {
    List<ShapePath.Point> shape = List.of(point(0, 0), point(3, 0));

    assertThat(ShapePath.between(shape, List.of(point(0, 0), point(2, 1)))).isNull();
  }

  /** A point kilometres north and east of 59° N, 18° E. */
  private static ShapePath.Point point(double northKm, double eastKm) {
    return new ShapePath.Point(59.0 + northKm * KM, 18.0 + eastKm * KM / Math.cos(Math.toRadians(59.0)));
  }
}
