package com.jetlag.places.model;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverpassLocationCategoryTest {

  @Test
  void matchesTagsToTheirCategory() {
    assertThat(OverpassLocationCategory.from(Map.of("amenity", "cinema"))).isEqualTo(OverpassLocationCategory.MOVIE_THEATRE);
    assertThat(OverpassLocationCategory.from(Map.of("aeroway", "aerodrome", "iata", "GOT")))
      .isEqualTo(OverpassLocationCategory.COMMERCIAL_AIRPORT);
  }

  @Test
  void requiresEveryFilterToMatch() {
    // An aerodrome without an IATA code is not a commercial airport
    assertThat(OverpassLocationCategory.from(Map.of("aeroway", "aerodrome"))).isEqualTo(OverpassLocationCategory.OTHER);
    assertThat(OverpassLocationCategory.from(Map.of("office", "diplomatic", "diplomatic", "embassy")))
      .isEqualTo(OverpassLocationCategory.OTHER);
  }

  @Test
  void fallsBackToOther() {
    assertThat(OverpassLocationCategory.from(Map.of("shop", "bakery"))).isEqualTo(OverpassLocationCategory.OTHER);
    assertThat(OverpassLocationCategory.from(null)).isEqualTo(OverpassLocationCategory.OTHER);
  }

  @Test
  void buildsOverpassStatements() {
    assertThat(OverpassLocationCategory.FOREIGN_CONSULATE.overpassStatement("a"))
      .isEqualTo("nwr(area.a)[\"office\"=\"diplomatic\"][\"diplomatic\"=\"consulate\"];");
    assertThat(OverpassLocationCategory.BODY_OF_WATER.overpassStatement("a"))
      .isEqualTo("nwr(area.a)[\"natural\"=\"water\"][\"name\"];");
    assertThatThrownBy(() -> OverpassLocationCategory.OTHER.overpassStatement("a"))
      .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void requestsGeometryOnlyForShapeCategories() {
    assertThat(OverpassLocationCategory.COASTLINE.hasGeometry()).isTrue();
    assertThat(OverpassLocationCategory.COASTLINE.outStatement()).isEqualTo("out geom tags;");
    assertThat(OverpassLocationCategory.ZOO.hasGeometry()).isFalse();
    assertThat(OverpassLocationCategory.ZOO.outStatement()).isEqualTo("out center tags;");
  }

  @Test
  void readsTheSubtypeFromItsTag() {
    assertThat(OverpassLocationCategory.BODY_OF_WATER.subtype(Map.of("water", "lake"))).isEqualTo("lake");
    assertThat(OverpassLocationCategory.ZOO.subtype(Map.of("water", "lake"))).isNull();
  }
}
