package com.jetlag.domain;

import com.jetlag.util.GtfsParserUtil;
import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_shapes",
  indexes = {
    @Index(name = "idx_gtfs_shapes_coordinates", columnList = "shape_pt_lat, shape_pt_lon"),
    @Index(name = "idx_gtfs_shapes_generation", columnList = "import_generation")
  }
)
@IdClass(ShapeId.class)
public class ShapeEntity {

  @Id
  @Column(name = "shape_id", nullable = false)
  private String shapeId;

  @Id
  @Column(name = "shape_pt_sequence", nullable = false)
  private Integer shapePtSequence;

  @Column(name = "shape_pt_lat", nullable = false)
  private Double shapePtLat;

  @Column(name = "shape_pt_lon", nullable = false)
  private Double shapePtLon;

  @Column(name = "shape_dist_traveled")
  private Double shapeDistTraveled;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public ShapeEntity() {
  }

  public ShapeEntity(CSVRecord record, String generation) {
    try {
      setShapeId(GtfsParserUtil.required(record, "shape_id"));
      setShapePtLat(Double.valueOf(
        GtfsParserUtil.required(record, "shape_pt_lat")));
      setShapePtLon(Double.valueOf(
        GtfsParserUtil.required(record, "shape_pt_lon")));
      setShapePtSequence(Integer.valueOf(
        GtfsParserUtil.required(record, "shape_pt_sequence")));

      setShapeDistTraveled(parseDouble(
        GtfsParserUtil.optional(record, "shape_dist_traveled")));
      setImportGeneration(generation);
    } catch (IOException | NumberFormatException e) {
      throw new RuntimeException(
        "Error parsing GTFS shape record", e);
    }
  }

  private static Double parseDouble(String value) {
    return value == null || value.isBlank()
      ? null
      : Double.valueOf(value);
  }

  public String getShapeId() {
    return shapeId;
  }

  public void setShapeId(String shapeId) {
    this.shapeId = shapeId;
  }

  public Integer getShapePtSequence() {
    return shapePtSequence;
  }

  public void setShapePtSequence(Integer shapePtSequence) {
    this.shapePtSequence = shapePtSequence;
  }

  public Double getShapePtLat() {
    return shapePtLat;
  }

  public void setShapePtLat(Double shapePtLat) {
    this.shapePtLat = shapePtLat;
  }

  public Double getShapePtLon() {
    return shapePtLon;
  }

  public void setShapePtLon(Double shapePtLon) {
    this.shapePtLon = shapePtLon;
  }

  public Double getShapeDistTraveled() {
    return shapeDistTraveled;
  }

  public void setShapeDistTraveled(Double shapeDistTraveled) {
    this.shapeDistTraveled = shapeDistTraveled;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
