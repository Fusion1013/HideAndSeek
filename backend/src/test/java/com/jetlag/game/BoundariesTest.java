package com.jetlag.game;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Polygon;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BoundariesTest {

  private static final List<List<Double>> OPEN_BOX = List.of(
    List.of(11.9, 57.6), List.of(12.1, 57.6), List.of(12.1, 57.8), List.of(11.9, 57.8));

  @Test
  void closesAnOpenRingAndConvertsBack() {
    Polygon polygon = Boundaries.toPolygon(OPEN_BOX);

    assertThat(polygon.getSRID()).isEqualTo(4326);
    assertThat(Boundaries.toRing(polygon)).hasSize(5).startsWith(OPEN_BOX.toArray(List[]::new))
      .endsWith(List.of(11.9, 57.6));
  }

  @Test
  void rejectsUnusableAreas() {
    assertThatThrownBy(() -> Boundaries.toPolygon(null)).isInstanceOf(InvalidBoundaryException.class);
    assertThatThrownBy(() -> Boundaries.toPolygon(OPEN_BOX.subList(0, 2))).isInstanceOf(InvalidBoundaryException.class);
    assertThatThrownBy(() -> Boundaries.toPolygon(List.of(List.of(0.0, 0.0), List.of(1.0, 1.0), List.of(2.0, 2.0))))
      .hasMessageContaining("empty");
    // A bow tie crosses itself
    assertThatThrownBy(() -> Boundaries.toPolygon(List.of(
      List.of(0.0, 0.0), List.of(1.0, 1.0), List.of(1.0, 0.0), List.of(0.0, 1.0)))).isInstanceOf(InvalidBoundaryException.class);
    assertThatThrownBy(() -> Boundaries.toPolygon(List.of(List.of(0.0, 0.0), List.of(200.0, 0.0), List.of(0.0, 1.0))))
      .hasMessageContaining("out of range");
    assertThatThrownBy(() -> Boundaries.toPolygon(List.of(List.of(0.0), List.of(1.0, 0.0), List.of(0.0, 1.0))))
      .isInstanceOf(InvalidBoundaryException.class);
  }
}
