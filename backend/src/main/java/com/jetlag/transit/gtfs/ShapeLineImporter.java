package com.jetlag.transit.gtfs;

import org.apache.commons.csv.CSVRecord;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.io.WKBWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Imports shapes.txt as one line per shape (gtfs_shape_lines), streaming: a shape is written once the file
 * moves on to the next one, so only one shape's points are held at a time. Feeds list each shape's points
 * together; a shape that shows up again later is appended to what was already written.
 * <p>
 * Rows are upserted by shape id, so a new import overwrites the previous one in place instead of storing a
 * second copy beside it; shapes no longer in the feed keep the old generation and are deleted afterwards.
 */
@Component
public class ShapeLineImporter {

  private static final Logger logger = LoggerFactory.getLogger(ShapeLineImporter.class);

  private static final int BATCH_SIZE = 200;

  private static final GeometryFactory GEOMETRY = new GeometryFactory(new PrecisionModel(), 4326);

  /**
   * On a repeat within the same import, appends to the line (dropping the doubled point of a one-point piece);
   * otherwise replaces the previous import's line.
   */
  private static final String UPSERT = """
    INSERT INTO gtfs_shape_lines (shape_id, geometry, import_generation)
    VALUES (?, ST_GeomFromEWKB(?), ?)
    ON CONFLICT (shape_id) DO UPDATE SET
      geometry = CASE WHEN gtfs_shape_lines.import_generation = EXCLUDED.import_generation
        THEN ST_RemoveRepeatedPoints(ST_MakeLine(gtfs_shape_lines.geometry, EXCLUDED.geometry))
        ELSE EXCLUDED.geometry END,
      import_generation = EXCLUDED.import_generation
    """;

  private final JdbcTemplate jdbcTemplate;

  ShapeLineImporter(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /** Imports every shape in the file and returns how many lines were written. */
  public int importShapes(Iterable<CSVRecord> records, String generation) {
    ImportRun run = new ImportRun(generation);
    for (CSVRecord record : records) run.add(record);
    run.finish();
    return run.lines;
  }

  private record Point(int sequence, double longitude, double latitude) {}

  private record Line(String shapeId, byte[] ewkb) {}

  /** One pass over shapes.txt: the shape being read, and the finished lines waiting to be written. */
  private final class ImportRun {
    private final String generation;
    private final List<Point> points = new ArrayList<>();
    private final List<Line> batch = new ArrayList<>();
    private final Set<String> writtenShapeIds = new HashSet<>();
    private String shapeId;
    private int lines;
    private int skippedPoints;
    private int skippedShapes;
    private int nextLogCount = 10_000;

    ImportRun(String generation) {
      this.generation = generation;
    }

    void add(CSVRecord record) {
      String recordShapeId = record.get("shape_id");
      if (!recordShapeId.equals(shapeId)) {
        finishShape();
        shapeId = recordShapeId;
      }
      double latitude = Double.parseDouble(record.get("shape_pt_lat"));
      double longitude = Double.parseDouble(record.get("shape_pt_lon"));
      // Exactly 0,0 is a missing position in the feed, not a point in the Gulf of Guinea
      if (latitude == 0 && longitude == 0) {
        skippedPoints++;
        return;
      }
      points.add(new Point(Integer.parseInt(record.get("shape_pt_sequence")), longitude, latitude));
    }

    void finish() {
      finishShape();
      if (!batch.isEmpty()) flush();
      if (skippedPoints > 0 || skippedShapes > 0) {
        logger.info("Left out {} GTFS shape points at 0,0 and {} shapes with fewer than two points",
          skippedPoints, skippedShapes);
      }
    }

    private void finishShape() {
      if (shapeId == null) return;
      boolean appending = writtenShapeIds.contains(shapeId);
      if (appending) logger.warn("GTFS shape {} is split up in shapes.txt; appending its points", shapeId);
      // A new line needs two points; a piece appended to an existing line can be a single one
      if (points.isEmpty() || (points.size() < 2 && !appending)) {
        if (!appending) skippedShapes++;
      } else {
        points.sort(Comparator.comparingInt(Point::sequence));
        Coordinate[] coordinates = points.stream()
          .map(point -> new Coordinate(point.longitude(), point.latitude()))
          .toArray(Coordinate[]::new);
        // The column only holds lines, so a single appended point goes as a line to itself
        LineString line = GEOMETRY.createLineString(
          coordinates.length == 1 ? new Coordinate[] {coordinates[0], coordinates[0]} : coordinates);
        line.setSRID(4326);
        batch.add(new Line(shapeId, new WKBWriter(2, true).write(line)));
        writtenShapeIds.add(shapeId);
        if (batch.size() >= BATCH_SIZE) flush();
      }
      points.clear();
    }

    private void flush() {
      jdbcTemplate.batchUpdate(UPSERT, batch, batch.size(), (statement, line) -> {
        statement.setString(1, line.shapeId());
        statement.setBytes(2, line.ewkb());
        statement.setString(3, generation);
      });
      lines += batch.size();
      batch.clear();
      if (lines >= nextLogCount) {
        logger.info("Imported {} GTFS shapes so far", lines);
        nextLogCount += 10_000;
      }
    }
  }
}
