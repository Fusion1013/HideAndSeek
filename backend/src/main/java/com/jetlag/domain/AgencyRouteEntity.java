package com.jetlag.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "gtfs_agency_routes")
public class AgencyRouteEntity {

  @Id
  @Column(name = "route_id")
  private String routeId;

  @Column(name = "agency_id")
  private String agencyId;

  @Column(name = "agency_fare_url")
  private String agencyFareUrl;

  @Column(name = "agency_lang")
  private String agencyLang;

  @Column(name = "agency_name")
  private String agencyName;

  @Column(name = "agency_timezone")
  private String agencyTimezone;

  @Column(name = "agency_url")
  private String agencyUrl;

  @Column(name = "route_description")
  private String routeDescription;

  @Column(name = "route_short_name")
  private String routeShortName;

  @Column(name = "route_long_name")
  private String routeLongName;

  @Column(name = "route_type")
  private String routeType;

  protected AgencyRouteEntity() {
  }

  public String getRouteId() {
    return routeId;
  }

  public String getAgencyId() {
    return agencyId;
  }

  public String getAgencyFareUrl() {
    return agencyFareUrl;
  }

  public String getAgencyLang() {
    return agencyLang;
  }

  public String getAgencyName() {
    return agencyName;
  }

  public String getAgencyTimezone() {
    return agencyTimezone;
  }

  public String getAgencyUrl() {
    return agencyUrl;
  }

  public String getRouteDescription() {
    return routeDescription;
  }

  public String getRouteShortName() {
    return routeShortName;
  }

  public String getRouteLongName() {
    return routeLongName;
  }

  public String getRouteType() {
    return routeType;
  }
}
