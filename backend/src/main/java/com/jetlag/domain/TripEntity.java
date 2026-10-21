package com.jetlag.domain;

import com.jetlag.util.GtfsParserUtil;
import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_trips",
  indexes = {
    @Index(name = "idx_gtfs_trips_trip_id", columnList = "trip_id"),
    @Index(name = "idx_gtfs_trips_route_id", columnList = "route_id"),
    @Index(name = "idx_gtfs_trips_import_generation", columnList = "import_generation"),
  }
)
public class TripEntity {

  @Id
  @Column(name = "trip_id", nullable = false)
  private String tripId;

  @Column(name = "route_id", nullable = false)
  private String routeId;

  @Column(name = "service_id", nullable = false)
  private String serviceId;

  @Column(name = "trip_headsign")
  private String tripHeadsign;

  @Column(name = "trip_short_name")
  private String tripShortName;

  @Column(name = "direction_id")
  private Integer directionId;

  @Column(name = "block_id")
  private String blockId;

  @Column(name = "shape_id")
  private String shapeId;

  @Column(name = "wheelchair_accessible")
  private Integer wheelchairAccessible;

  @Column(name = "bikes_allowed")
  private Integer bikesAllowed;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public TripEntity() {
  }

  public TripEntity(CSVRecord record, String generation) {
    try {
      setRouteId(GtfsParserUtil.required(record, "route_id"));
      setServiceId(GtfsParserUtil.required(record, "service_id"));
      setTripId(GtfsParserUtil.required(record, "trip_id"));
      setTripHeadsign(GtfsParserUtil.optional(record, "trip_headsign"));
      setTripShortName(GtfsParserUtil.optional(record, "trip_short_name"));
      setDirectionId(parseInteger(
        GtfsParserUtil.optional(record, "direction_id")));
      setBlockId(GtfsParserUtil.optional(record, "block_id"));
      setShapeId(GtfsParserUtil.optional(record, "shape_id"));
      setWheelchairAccessible(parseInteger(
        GtfsParserUtil.optional(record, "wheelchair_accessible")));
      setBikesAllowed(parseInteger(
        GtfsParserUtil.optional(record, "bikes_allowed")));
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS trip record", e);
    }
  }

  private static Integer parseInteger(String value) {
    return value == null || value.isBlank()
      ? null
      : Integer.valueOf(value);
  }

  public String getTripId() {
    return tripId;
  }

  public void setTripId(String tripId) {
    this.tripId = tripId;
  }

  public String getRouteId() {
    return routeId;
  }

  public void setRouteId(String routeId) {
    this.routeId = routeId;
  }

  public String getServiceId() {
    return serviceId;
  }

  public void setServiceId(String serviceId) {
    this.serviceId = serviceId;
  }

  public String getTripHeadsign() {
    return tripHeadsign;
  }

  public void setTripHeadsign(String tripHeadsign) {
    this.tripHeadsign = tripHeadsign;
  }

  public String getTripShortName() {
    return tripShortName;
  }

  public void setTripShortName(String tripShortName) {
    this.tripShortName = tripShortName;
  }

  public Integer getDirectionId() {
    return directionId;
  }

  public void setDirectionId(Integer directionId) {
    this.directionId = directionId;
  }

  public String getBlockId() {
    return blockId;
  }

  public void setBlockId(String blockId) {
    this.blockId = blockId;
  }

  public String getShapeId() {
    return shapeId;
  }

  public void setShapeId(String shapeId) {
    this.shapeId = shapeId;
  }

  public Integer getWheelchairAccessible() {
    return wheelchairAccessible;
  }

  public void setWheelchairAccessible(Integer wheelchairAccessible) {
    this.wheelchairAccessible = wheelchairAccessible;
  }

  public Integer getBikesAllowed() {
    return bikesAllowed;
  }

  public void setBikesAllowed(Integer bikesAllowed) {
    this.bikesAllowed = bikesAllowed;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
