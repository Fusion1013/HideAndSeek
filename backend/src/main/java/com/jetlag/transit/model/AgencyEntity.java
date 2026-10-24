package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;

@Entity
@Table(
  name = "gtfs_agency",
  indexes = {
    @Index(name = "idx_gtfs_agencies_name", columnList = "agency_name")
  }
)
public class AgencyEntity {

  @Id
  @Column(name = "agency_id", nullable = false)
  private String agencyId;

  @Column(name = "agency_name")
  private String agencyName;

  @Column(name = "agency_url")
  private String agencyUrl;

  @Column(name = "agency_timezone")
  private String agencyTimezone;

  @Column(name = "agency_lang")
  private String agencyLang;

  @Column(name = "agency_fare_url")
  private String agencyFareUrl;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public AgencyEntity() {
  }

  public AgencyEntity(CSVRecord record, String generation) {
    try {
      setAgencyId(GtfsParserUtil.required(record, "agency_id"));
      setAgencyName(GtfsParserUtil.optional(record, "agency_name"));
      setAgencyUrl(GtfsParserUtil.optional(record, "agency_url"));
      setAgencyTimezone(GtfsParserUtil.optional(record, "agency_timezone"));
      setAgencyLang(GtfsParserUtil.optional(record, "agency_lang"));
      setAgencyFareUrl(GtfsParserUtil.optional(record, "agency_fare_url"));
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS stop record", e);
    }
  }

  public String getAgencyId() {
    return agencyId;
  }

  public void setAgencyId(String agencyId) {
    this.agencyId = agencyId;
  }

  public String getAgencyName() {
    return agencyName;
  }

  public void setAgencyName(String agencyName) {
    this.agencyName = agencyName;
  }

  public String getAgencyUrl() {
    return agencyUrl;
  }

  public void setAgencyUrl(String agencyUrl) {
    this.agencyUrl = agencyUrl;
  }

  public String getAgencyTimezone() {
    return agencyTimezone;
  }

  public void setAgencyTimezone(String agencyTimezone) {
    this.agencyTimezone = agencyTimezone;
  }

  public String getAgencyLang() {
    return agencyLang;
  }

  public void setAgencyLang(String agencyLang) {
    this.agencyLang = agencyLang;
  }

  public String getAgencyFareUrl() {
    return agencyFareUrl;
  }

  public void setAgencyFareUrl(String agencyFareUrl) {
    this.agencyFareUrl = agencyFareUrl;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
