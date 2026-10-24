package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_routes",
  indexes = {
    @Index(name = "idx_gtfs_routes_agency_id", columnList = "agency_id")
  }
)
public class RouteEntity {

  @Id
  @Column(name = "route_id", nullable = false)
  private String routeId;

  @Column(name = "agency_id")
  private String agencyId;

  @Column(name = "route_short_name")
  private String routeShortName;

  @Column(name = "route_long_name")
  private String routeLongName;

  @Column(name = "route_type")
  private String routeType;

  @Column(name = "route_url")
  private String routeUrl;

  @Column(name = "route_description")
  private String routeDescription;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public RouteEntity() {

  }

  public RouteEntity(CSVRecord record, String generation) {
    try {
      setRouteId(GtfsParserUtil.required(record, "route_id"));
      setAgencyId(GtfsParserUtil.optional(record, "agency_id"));
      setRouteShortName(GtfsParserUtil.optional(record, "route_short_name"));
      setRouteLongName(GtfsParserUtil.optional(record, "route_long_name"));
      setRouteType(GtfsParserUtil.optional(record, "route_type"));
      setRouteUrl(GtfsParserUtil.optional(record, "route_url"));
      setRouteDescription(GtfsParserUtil.optional(record, "route_description"));
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS route record", e);
    }
  }

  public String getRouteId() {
    return routeId;
  }

  public void setRouteId(String routeId) {
    this.routeId = routeId;
  }

  public String getAgencyId() {
    return agencyId;
  }

  public void setAgencyId(String agencyId) {
    this.agencyId = agencyId;
  }

  public String getRouteShortName() {
    return routeShortName;
  }

  public void setRouteShortName(String routeShortName) {
    this.routeShortName = routeShortName;
  }

  public String getRouteLongName() {
    return routeLongName;
  }

  public void setRouteLongName(String routeLongName) {
    this.routeLongName = routeLongName;
  }

  public String getRouteType() {
    return routeType;
  }

  public void setRouteType(String routeType) {
    this.routeType = routeType;
  }

  public String getRouteUrl() {
    return routeUrl;
  }

  public void setRouteUrl(String routeUrl) {
    this.routeUrl = routeUrl;
  }

  public String getRouteDescription() {
    return routeDescription;
  }

  public void setRouteDescription(String routeDescription) {
    this.routeDescription = routeDescription;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
