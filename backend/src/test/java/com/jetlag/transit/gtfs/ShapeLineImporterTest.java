package com.jetlag.transit.gtfs;

import com.jetlag.transit.api.ShapePointDTO;
import com.jetlag.transit.repository.ShapeRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.StringReader;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** Runs against a real PostGIS database in Docker; skipped when Docker is not available. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Import({ShapeLineImporter.class, ShapeLinesMigration.class})
class ShapeLineImporterTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
    DockerImageName.parse("postgis/postgis:17-3.5-alpine").asCompatibleSubstituteFor("postgres"));

  @Autowired
  private ShapeLineImporter importer;

  @Autowired
  private ShapeLinesMigration migration;

  @Autowired
  private ShapeRepository shapes;

  @Autowired
  private JdbcTemplate jdbcTemplate;

  private static List<CSVRecord> csv(String rows) throws IOException {
    return CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).get()
      .parse(new StringReader("shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" + rows))
      .getRecords();
  }

  private List<ShapePointDTO> points(String shapeId) {
    return ShapePointDTO.from(shapes.findByShapeIdIn(List.of(shapeId)));
  }

  @Test
  void storesOneOrderedLinePerShape() throws IOException {
    int lines = importer.importShapes(csv("""
      a,57.70,11.90,2
      a,57.60,11.80,1
      a,57.80,12.00,3
      b,0,0,1
      b,57.00,12.00,2
      b,57.10,12.10,3
      lonely,58.00,13.00,1
      a,57.90,12.10,4
      """), "first");

    assertThat(lines).isEqualTo(3);   // a, b, and a again; the one-point shape is left out
    assertThat(points("a")).extracting(ShapePointDTO::shapePtSequence, ShapePointDTO::shapePtLat, ShapePointDTO::shapePtLon)
      .containsExactly(tuple(1, 57.6, 11.8), tuple(2, 57.7, 11.9), tuple(3, 57.8, 12.0), tuple(4, 57.9, 12.1));
    assertThat(points("b")).extracting(ShapePointDTO::shapePtLat).containsExactly(57.0, 57.1);
    assertThat(points("lonely")).isEmpty();
  }

  @Test
  void aNewImportReplacesTheLinesInsteadOfAddingToThem() throws IOException {
    importer.importShapes(csv("a,57.0,12.0,1\na,57.1,12.1,2\nold,57.0,12.0,1\nold,57.1,12.1,2\n"), "first");
    importer.importShapes(csv("a,58.0,13.0,1\na,58.1,13.1,2\n"), "second");

    assertThat(points("a")).extracting(ShapePointDTO::shapePtLat).containsExactly(58.0, 58.1);
    assertThat(shapes.deleteNotInGeneration("second")).isEqualTo(1);
    assertThat(shapes.count()).isEqualTo(1);
  }

  @Test
  void convertsTheOldPointTableAndDropsIt() {
    jdbcTemplate.execute("""
      CREATE TABLE gtfs_shapes (shape_id text, shape_pt_sequence int, shape_pt_lat float8, shape_pt_lon float8,
        shape_dist_traveled float8, import_generation varchar(36))
      """);
    jdbcTemplate.execute("""
      INSERT INTO gtfs_shapes VALUES
        ('a', 2, 57.7, 11.9, NULL, 'old'), ('a', 1, 57.6, 11.8, NULL, 'old'), ('a', 3, 0, 0, NULL, 'old'),
        ('lonely', 1, 58.0, 13.0, NULL, 'old')
      """);

    migration.migrate();

    assertThat(points("a")).extracting(ShapePointDTO::shapePtLat).containsExactly(57.6, 57.7);
    assertThat(shapes.count()).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject("SELECT to_regclass('public.gtfs_shapes') IS NULL", Boolean.class)).isTrue();
  }
}
