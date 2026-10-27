package com.jetlag.transit.model;

import jakarta.persistence.*;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalDate;

/** The weekdays a service runs on between two dates; {@link CalendarDateEntity} adds and removes single days. */
@Entity
@Table(
  name = "gtfs_calendar",
  indexes = {
    @Index(name = "idx_gtfs_calendar_import_generation", columnList = "import_generation")
  }
)
public class CalendarEntity {

  @Id
  @Column(name = "service_id", nullable = false)
  private String serviceId;

  @Column(name = "monday", nullable = false)
  private boolean monday;

  @Column(name = "tuesday", nullable = false)
  private boolean tuesday;

  @Column(name = "wednesday", nullable = false)
  private boolean wednesday;

  @Column(name = "thursday", nullable = false)
  private boolean thursday;

  @Column(name = "friday", nullable = false)
  private boolean friday;

  @Column(name = "saturday", nullable = false)
  private boolean saturday;

  @Column(name = "sunday", nullable = false)
  private boolean sunday;

  @Column(name = "start_date", nullable = false)
  private LocalDate startDate;

  @Column(name = "end_date", nullable = false)
  private LocalDate endDate;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  public CalendarEntity() {
  }

  public CalendarEntity(CSVRecord record, String generation) {
    try {
      setServiceId(GtfsParserUtil.required(record, "service_id"));
      setMonday(runsOn(record, DayOfWeek.MONDAY));
      setTuesday(runsOn(record, DayOfWeek.TUESDAY));
      setWednesday(runsOn(record, DayOfWeek.WEDNESDAY));
      setThursday(runsOn(record, DayOfWeek.THURSDAY));
      setFriday(runsOn(record, DayOfWeek.FRIDAY));
      setSaturday(runsOn(record, DayOfWeek.SATURDAY));
      setSunday(runsOn(record, DayOfWeek.SUNDAY));
      setStartDate(GtfsParserUtil.date(record, "start_date"));
      setEndDate(GtfsParserUtil.date(record, "end_date"));
      if (getStartDate() == null || getEndDate() == null) {
        throw new IOException("Missing start_date or end_date on GTFS row " + record.getRecordNumber());
      }
      setImportGeneration(generation);
    } catch (IOException e) {
      throw new RuntimeException("Error parsing GTFS calendar record", e);
    }
  }

  /** The column of a weekday, such as {@code monday}. */
  public static String column(DayOfWeek day) {
    return day.name().toLowerCase();
  }

  private static boolean runsOn(CSVRecord record, DayOfWeek day) throws IOException {
    return Integer.valueOf(1).equals(GtfsParserUtil.integer(record, column(day)));
  }

  public String getServiceId() {
    return serviceId;
  }

  public void setServiceId(String serviceId) {
    this.serviceId = serviceId;
  }

  public boolean isMonday() {
    return monday;
  }

  public void setMonday(boolean monday) {
    this.monday = monday;
  }

  public boolean isTuesday() {
    return tuesday;
  }

  public void setTuesday(boolean tuesday) {
    this.tuesday = tuesday;
  }

  public boolean isWednesday() {
    return wednesday;
  }

  public void setWednesday(boolean wednesday) {
    this.wednesday = wednesday;
  }

  public boolean isThursday() {
    return thursday;
  }

  public void setThursday(boolean thursday) {
    this.thursday = thursday;
  }

  public boolean isFriday() {
    return friday;
  }

  public void setFriday(boolean friday) {
    this.friday = friday;
  }

  public boolean isSaturday() {
    return saturday;
  }

  public void setSaturday(boolean saturday) {
    this.saturday = saturday;
  }

  public boolean isSunday() {
    return sunday;
  }

  public void setSunday(boolean sunday) {
    this.sunday = sunday;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public void setStartDate(LocalDate startDate) {
    this.startDate = startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public void setEndDate(LocalDate endDate) {
    this.endDate = endDate;
  }

  public String getImportGeneration() {
    return importGeneration;
  }

  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
