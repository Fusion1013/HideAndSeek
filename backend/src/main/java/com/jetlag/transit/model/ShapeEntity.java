package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.locationtech.jts.geom.LineString;

/**
 * A GTFS shape (shapes.txt) as one line, its points in sequence order. One row per shape rather than per
 * point: Sweden's feed has about 80 thousand shapes but 58 million points, which as rows took over 13 GB.
 * Written by {@link com.jetlag.transit.gtfs.ShapeLineImporter}.
 */
@Entity
@Table(
  name = "gtfs_shape_lines",
  indexes = @Index(name = "idx_gtfs_shape_lines_generation", columnList = "import_generation")
)
public class ShapeEntity {

  @Id
  @Column(name = "shape_id", nullable = false)
  private String shapeId;

  /** Longitude/latitude points (EPSG:4326) in shape_pt_sequence order. */
  @Column(nullable = false, columnDefinition = "geometry(LineString,4326)")
  private LineString geometry;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  protected ShapeEntity() {
  }

  public String getShapeId() {
    return shapeId;
  }

  public LineString getGeometry() {
    return geometry;
  }

  public String getImportGeneration() {
    return importGeneration;
  }
}
