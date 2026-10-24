package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_stop_times",
  indexes = {
    @Index(name = "idx_gtfs_stop_times_trip_id", columnList = "trip_id"),
    // For a station's timetable, and building gtfs_route_stops
    @Index(name = "idx_gtfs_stop_times_stop_id", columnList = "stop_id"),
    @Index(name = "idx_gtfs_stop_times_import_generation", columnList = "import_generation")
  }
)
@IdClass(StopTimeId.class)
public class StopTimeEntity {

  @Id
  @Column(name = "trip_id", nullable = false)
  private String tripId;

  @Id
  @Column(name = "stop_sequence", nullable = false)
  private Integer stopSequence;

  @Column(name = "arrival_time")
  private String arrivalTime;

  @Column(name = "departure_time")
  private String departureTime;

  @Column(name = "stop_id")
  private String stopId;

  @Column(name = "location_group_id")
  private String locationGroupId;

  @Column(name = "location_id")
  private String locationId;

  @Column(name = "stop_headsign")
  private String stopHeadsign;

  @Column(name = "start_pickup_drop_off_window")
  private String startPickupDropOffWindow;

  @Column(name = "end_pickup_drop_off_window")
  private String endPickupDropOffWindow;

  @Column(name = "pickup_type")
  private Integer pickupType;

  @Column(name = "drop_off_type")
  private Integer dropOffType;

  @Column(name = "continuous_pickup")
  private Integer continuousPickup;

  @Column(name = "continuous_drop_off")
  private Integer continuousDropOff;

  @Column(name = "shape_dist_traveled")
  private Double shapeDistTraveled;

  @Column(name = "timepoint")
  private Integer timepoint;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public StopTimeEntity() {
  }

  public StopTimeEntity(CSVRecord record, String generation) {
    try {
      setTripId(GtfsParserUtil.required(record, "trip_id"));
      setStopSequence(Integer.valueOf(
        GtfsParserUtil.required(record, "stop_sequence")));

      setArrivalTime(GtfsParserUtil.optional(record, "arrival_time"));
      setDepartureTime(GtfsParserUtil.optional(record, "departure_time"));
      setStopId(GtfsParserUtil.optional(record, "stop_id"));
      setLocationGroupId(
        GtfsParserUtil.optional(record, "location_group_id"));
      setLocationId(GtfsParserUtil.optional(record, "location_id"));
      setStopHeadsign(GtfsParserUtil.optional(record, "stop_headsign"));
      setStartPickupDropOffWindow(
        GtfsParserUtil.optional(record, "start_pickup_drop_off_window"));
      setEndPickupDropOffWindow(
        GtfsParserUtil.optional(record, "end_pickup_drop_off_window"));

      setPickupType(parseInteger(
        GtfsParserUtil.optional(record, "pickup_type")));
      setDropOffType(parseInteger(
        GtfsParserUtil.optional(record, "drop_off_type")));
      setContinuousPickup(parseInteger(
        GtfsParserUtil.optional(record, "continuous_pickup")));
      setContinuousDropOff(parseInteger(
        GtfsParserUtil.optional(record, "continuous_drop_off")));
      setShapeDistTraveled(parseDouble(
        GtfsParserUtil.optional(record, "shape_dist_traveled")));
      setTimepoint(parseInteger(
        GtfsParserUtil.optional(record, "timepoint")));

      setImportGeneration(generation);
    } catch (IOException | NumberFormatException e) {
      throw new RuntimeException(
        "Error parsing GTFS stop_time record", e);
    }
  }

  private static Integer parseInteger(String value) {
    return value == null || value.isBlank()
      ? null
      : Integer.valueOf(value);
  }

  private static Double parseDouble(String value) {
    return value == null || value.isBlank()
      ? null
      : Double.valueOf(value);
  }

  public String getTripId() {
    return tripId;
  }

  public void setTripId(String tripId) {
    this.tripId = tripId;
  }

  public Integer getStopSequence() {
    return stopSequence;
  }

  public void setStopSequence(Integer stopSequence) {
    this.stopSequence = stopSequence;
  }

  public String getArrivalTime() {
    return arrivalTime;
  }

  public void setArrivalTime(String arrivalTime) {
    this.arrivalTime = arrivalTime;
  }

  public String getDepartureTime() {
    return departureTime;
  }

  public void setDepartureTime(String departureTime) {
    this.departureTime = departureTime;
  }

  public String getStopId() {
    return stopId;
  }

  public void setStopId(String stopId) {
    this.stopId = stopId;
  }

  public String getLocationGroupId() {
    return locationGroupId;
  }

  public void setLocationGroupId(String locationGroupId) {
    this.locationGroupId = locationGroupId;
  }

  public String getLocationId() {
    return locationId;
  }

  public void setLocationId(String locationId) {
    this.locationId = locationId;
  }

  public String getStopHeadsign() {
    return stopHeadsign;
  }

  public void setStopHeadsign(String stopHeadsign) {
    this.stopHeadsign = stopHeadsign;
  }

  public String getStartPickupDropOffWindow() {
    return startPickupDropOffWindow;
  }

  public void setStartPickupDropOffWindow(String startPickupDropOffWindow) {
    this.startPickupDropOffWindow = startPickupDropOffWindow;
  }

  public String getEndPickupDropOffWindow() {
    return endPickupDropOffWindow;
  }

  public void setEndPickupDropOffWindow(String endPickupDropOffWindow) {
    this.endPickupDropOffWindow = endPickupDropOffWindow;
  }

  public Integer getPickupType() {
    return pickupType;
  }

  public void setPickupType(Integer pickupType) {
    this.pickupType = pickupType;
  }

  public Integer getDropOffType() {
    return dropOffType;
  }

  public void setDropOffType(Integer dropOffType) {
    this.dropOffType = dropOffType;
  }

  public Integer getContinuousPickup() {
    return continuousPickup;
  }

  public void setContinuousPickup(Integer continuousPickup) {
    this.continuousPickup = continuousPickup;
  }

  public Integer getContinuousDropOff() {
    return continuousDropOff;
  }

  public void setContinuousDropOff(Integer continuousDropOff) {
    this.continuousDropOff = continuousDropOff;
  }

  public Double getShapeDistTraveled() {
    return shapeDistTraveled;
  }

  public void setShapeDistTraveled(Double shapeDistTraveled) {
    this.shapeDistTraveled = shapeDistTraveled;
  }

  public Integer getTimepoint() {
    return timepoint;
  }

  public void setTimepoint(Integer timepoint) {
    this.timepoint = timepoint;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
