package com.jetlag.transit.model;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

public class CalendarDateId implements Serializable {

  private String serviceId;
  private LocalDate date;

  public CalendarDateId() {
  }

  public CalendarDateId(String serviceId, LocalDate date) {
    this.serviceId = serviceId;
    this.date = date;
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

  @Override
  public boolean equals(Object object) {
    if (this == object) {
      return true;
    }

    if (!(object instanceof CalendarDateId other)) {
      return false;
    }

    return Objects.equals(serviceId, other.serviceId)
      && Objects.equals(date, other.date);
  }

  @Override
  public int hashCode() {
    return Objects.hash(serviceId, date);
  }
}
