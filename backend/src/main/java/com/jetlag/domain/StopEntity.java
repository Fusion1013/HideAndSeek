package com.jetlag.domain;

import com.jetlag.util.GtfsParserUtil;
import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_stops",
  indexes = {
    @Index(name = "idx_gtfs_stops_name", columnList = "stop_name"),
    @Index(name = "idx_gtfs_stops_coordinates",
      columnList = "stop_lat, stop_lon"),
    @Index(name = "idx_gtfs_stops_generation",
      columnList = "import_generation")
  }
)
public class StopEntity {

  @Id
  @Column(name = "stop_id", nullable = false, length = 255)
  private String stopId;

  @Column(name = "stop_code")
  private String stopCode;

  @Column(name = "stop_name")
  private String stopName;

  @Column(name = "stop_desc", columnDefinition = "text")
  private String stopDescription;

  @Column(name = "stop_lat")
  private Double latitude;

  @Column(name = "stop_lon")
  private Double longitude;

  @Column(name = "zone_id")
  private String zoneId;

  @Column(name = "stop_url", columnDefinition = "text")
  private String stopUrl;

  @Column(name = "location_type")
  private Integer locationType;

  @Column(name = "parent_station")
  private String parentStation;

  @Column(name = "wheelchair_boarding")
  private Integer wheelchairBoarding;

  @Column(name = "level_id")
  private String levelId;

  @Column(name = "platform_code")
  private String platformCode;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public StopEntity() {
  }

  public StopEntity(CSVRecord record, String generation) {
    try {
      setStopId(GtfsParserUtil.required(record, "stop_id"));
      setStopCode(GtfsParserUtil.optional(record, "stop_code"));
      setStopName(GtfsParserUtil.optional(record, "stop_name"));
      setStopDescription(GtfsParserUtil.optional(record, "stop_desc"));
      setLatitude(GtfsParserUtil.decimal(record, "stop_lat"));
      setLongitude(GtfsParserUtil.decimal(record, "stop_lon"));
      setZoneId(GtfsParserUtil.optional(record, "zone_id"));
      setStopUrl(GtfsParserUtil.optional(record, "stop_url"));
      setLocationType(GtfsParserUtil.integer(record, "location_type"));
      setParentStation(GtfsParserUtil.optional(record, "parent_station"));
      setWheelchairBoarding(GtfsParserUtil.integer(record, "wheelchair_boarding"));
      setLevelId(GtfsParserUtil.optional(record, "level_id"));
      setPlatformCode(GtfsParserUtil.optional(record, "platform_code"));
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS stop record", e);
    }
  }

  public String getStopId() {
    return stopId;
  }

  public void setStopId(String stopId) {
    this.stopId = stopId;
  }

  public String getStopCode() {
    return stopCode;
  }

  public void setStopCode(String stopCode) {
    this.stopCode = stopCode;
  }

  public String getStopName() {
    return stopName;
  }

  public void setStopName(String stopName) {
    this.stopName = stopName;
  }

  public String getStopDescription() {
    return stopDescription;
  }

  public void setStopDescription(String stopDescription) {
    this.stopDescription = stopDescription;
  }

  public Double getLatitude() {
    return latitude;
  }

  public void setLatitude(Double latitude) {
    this.latitude = latitude;
  }

  public Double getLongitude() {
    return longitude;
  }

  public void setLongitude(Double longitude) {
    this.longitude = longitude;
  }

  public String getZoneId() {
    return zoneId;
  }

  public void setZoneId(String zoneId) {
    this.zoneId = zoneId;
  }

  public String getStopUrl() {
    return stopUrl;
  }

  public void setStopUrl(String stopUrl) {
    this.stopUrl = stopUrl;
  }

  public Integer getLocationType() {
    return locationType;
  }

  public void setLocationType(Integer locationType) {
    this.locationType = locationType;
  }

  public String getParentStation() {
    return parentStation;
  }

  public void setParentStation(String parentStation) {
    this.parentStation = parentStation;
  }

  public Integer getWheelchairBoarding() {
    return wheelchairBoarding;
  }

  public void setWheelchairBoarding(Integer wheelchairBoarding) {
    this.wheelchairBoarding = wheelchairBoarding;
  }

  public String getLevelId() {
    return levelId;
  }

  public void setLevelId(String levelId) {
    this.levelId = levelId;
  }

  public String getPlatformCode() {
    return platformCode;
  }

  public void setPlatformCode(String platformCode) {
    this.platformCode = platformCode;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
