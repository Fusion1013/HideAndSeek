package com.jetlag.places.importer;

import com.jetlag.places.model.OsmType;
import com.jetlag.places.model.OverpassLocationCategory;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.repository.OverpassLocationRepository;
import com.jetlag.places.repository.OverpassVoronoiCellRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Runs against a real PostGIS database in Docker; skipped when Docker is not available. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Import(OverpassVoronoiService.class)
class OverpassVoronoiServiceTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  private static final Map<String, String> MUSEUM = Map.of("tourism", "museum");

  @Autowired
  private OverpassVoronoiService voronoi;

  @Autowired
  private OverpassLocationRepository locations;

  @Autowired
  private OverpassVoronoiCellRepository cells;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  private OverpassLocationEntity save(long osmId, double latitude, double longitude) {
    OverpassLocationEntity location = new OverpassLocationEntity(OsmType.NODE, osmId);
    location.update(latitude, longitude, MUSEUM, "generation");
    return locations.saveAndFlush(location);
  }

  /** Whether the place's stored cell contains the point. */
  private boolean cellContains(OverpassLocationEntity location, double latitude, double longitude) {
    return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
        SELECT ST_Contains(geometry, ST_SetSRID(ST_MakePoint(?, ?), 4326))
        FROM overpass_voronoi_cell WHERE overpass_location_id = ?
        """, Boolean.class, longitude, latitude, location.getId()));
  }

  @Test
  void storesEachPlacesCellInLongitudeAndLatitude() {
    OverpassLocationEntity gothenburg = save(1, 57.70, 11.97);
    OverpassLocationEntity stockholm = save(2, 59.33, 18.07);
    OverpassLocationEntity malmo = save(3, 55.60, 13.00);

    assertThat(voronoi.buildCells(OverpassLocationCategory.MUSEUM)).isEqualTo(3);

    assertThat(cellContains(gothenburg, 57.70, 11.97)).isTrue();
    assertThat(cellContains(stockholm, 59.33, 18.07)).isTrue();
    assertThat(cellContains(malmo, 55.60, 13.00)).isTrue();
    // Jönköping is closer to Gothenburg than to Stockholm or Malmö
    assertThat(cellContains(gothenburg, 57.78, 14.16)).isTrue();

    var inView = locations.findWithVoronoiCellIntersecting(
      "MUSEUM", 59.2, 17.9, 59.4, 18.2, PageRequest.of(0, 10, Sort.by("id")));
    assertThat(inView.getContent()).extracting(OverpassLocationEntity::getOsmId).contains(2L);
    assertThat(inView.getTotalElements()).isEqualTo(inView.getContent().size());

    var all = locations.findWithVoronoiCell("MUSEUM", PageRequest.of(0, 10, Sort.by("id")));
    assertThat(all.getContent()).extracting(OverpassLocationEntity::getOsmId).containsExactly(1L, 2L, 3L);

    String geoJson = cells.findGeoJsonByIdIn(List.of(stockholm.getId()), 0).getFirst().getGeoJson();
    assertThat(geoJson).startsWith("{\"type\":\"Polygon\"");
  }

  @Test
  void deletesCellsSoTheirPlacesCanBeDeleted() {
    OverpassLocationEntity first = save(1, 57.70, 11.97);
    save(2, 59.33, 18.07);
    voronoi.buildCells(OverpassLocationCategory.MUSEUM);

    voronoi.deleteCells(OverpassLocationCategory.MUSEUM);
    assertThat(cells.count()).isZero();
    locations.deleteById(first.getId());
    locations.flush();

    // Rebuilt from what is left: the remaining place is closest everywhere
    assertThat(voronoi.buildCells(OverpassLocationCategory.MUSEUM)).isEqualTo(1);
  }
}
