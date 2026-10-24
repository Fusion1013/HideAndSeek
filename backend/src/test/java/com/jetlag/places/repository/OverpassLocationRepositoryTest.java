package com.jetlag.places.repository;

import com.jetlag.places.model.OsmType;
import com.jetlag.places.model.OverpassGeometryEntity;
import com.jetlag.places.model.OverpassLocationEntity;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Runs against a real PostGIS database in Docker; skipped when Docker is not available. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class OverpassLocationRepositoryTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final GeometryFactory GEOMETRY = new GeometryFactory(new PrecisionModel(), 4326);

  @Autowired
  private OverpassLocationRepository locations;

  @Autowired
  private OverpassGeometryRepository geometries;

  private OverpassLocationEntity save(long osmId, double latitude, double longitude, Map<String, String> tags) {
    OverpassLocationEntity location = new OverpassLocationEntity(OsmType.WAY, osmId);
    location.update(latitude, longitude, tags, "generation");
    return locations.saveAndFlush(location);
  }

  @Test
  void matchesShapesThatCrossTheBoundsEvenWhenTheirCenterIsOutside() {
    // A coastline running east from inside the box; its stored center is well outside it
    OverpassLocationEntity line = save(1, 57.7, 13.0, Map.of("natural", "coastline"));
    LineString shape = GEOMETRY.createLineString(new Coordinate[] {new Coordinate(11.95, 57.7), new Coordinate(14.0, 57.7)});
    OverpassGeometryEntity geometry = new OverpassGeometryEntity(line);
    geometry.setGeometry(shape);
    geometries.saveAndFlush(geometry);

    // A place without a stored shape falls back to its center point
    save(2, 57.71, 11.97, Map.of("natural", "coastline"));
    save(3, 59.0, 18.0, Map.of("natural", "coastline"));

    var page = locations.findByCategoryIntersecting(
      "COASTLINE", 57.6, 11.9, 57.8, 12.0, PageRequest.of(0, 10, Sort.by("id")));

    assertThat(page.getContent()).extracting(OverpassLocationEntity::getOsmId).containsExactly(1L, 2L);
    assertThat(page.getTotalElements()).isEqualTo(2);
  }

  @Test
  void simplifiesGeoJsonOnRequest() {
    OverpassLocationEntity line = save(1, 57.7, 12.0, Map.of("natural", "coastline"));
    Coordinate[] wiggly = new Coordinate[101];
    for (int i = 0; i <= 100; i++) wiggly[i] = new Coordinate(12.0 + i * 0.001, 57.7 + (i % 2) * 0.00001);
    OverpassGeometryEntity geometry = new OverpassGeometryEntity(line);
    geometry.setGeometry(GEOMETRY.createLineString(wiggly));
    geometries.saveAndFlush(geometry);

    String full = geometries.findGeoJsonByIdIn(java.util.List.of(line.getId()), 0).getFirst().getGeoJson();
    String simplified = geometries.findGeoJsonByIdIn(java.util.List.of(line.getId()), 0.001).getFirst().getGeoJson();

    assertThat(simplified.length()).isLessThan(full.length() / 10);
  }
}
