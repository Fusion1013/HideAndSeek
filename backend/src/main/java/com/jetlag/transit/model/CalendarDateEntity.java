package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;
import java.time.LocalDate;

/** A day a service runs, or does not run, whatever its {@link CalendarEntity} says. */
@Entity
@Table(
  name = "gtfs_calendar_dates",
  indexes = {
    // For the services running on a day
    @Index(name = "idx_gtfs_calendar_dates_date", columnList = "date"),
    @Index(name = "idx_gtfs_calendar_dates_import_generation", columnList = "import_generation")
  }
)
@IdClass(CalendarDateId.class)
public class CalendarDateEntity {

  /** GTFS exception_type: the service runs on this day. */
  public static final int ADDED = 1;
  /** GTFS exception_type: the service does not run on this day. */
  public static final int REMOVED = 2;

  @Id
  @Column(name = "service_id", nullable = false)
  private String serviceId;

  @Id
  @Column(name = "date", nullable = false)
  private LocalDate date;

  @Column(name = "exception_type", nullable = false)
  private Integer exceptionType;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public CalendarDateEntity() {
  }

  public CalendarDateEntity(CSVRecord record, String generation) {
    try {
      setServiceId(GtfsParserUtil.required(record, "service_id"));
      setDate(GtfsParserUtil.date(record, "date"));
      setExceptionType(GtfsParserUtil.integer(record, "exception_type"));
      if (getDate() == null || getExceptionType() == null) {
        throw new IOException("Missing date or exception_type on GTFS row " + record.getRecordNumber());
      }
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS calendar_dates record", e);
    }
  }

  public String getServiceId() {
    return serviceId;
  }

  public void setServiceId(String serviceId) {
    this.serviceId = serviceId;
  }

  public LocalDate getDate() {
    return date;
  }

  public void setDate(LocalDate date) {
    this.date = date;
  }

  public Integer getExceptionType() {
    return exceptionType;
  }

  public void setExceptionType(Integer exceptionType) {
    this.exceptionType = exceptionType;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
