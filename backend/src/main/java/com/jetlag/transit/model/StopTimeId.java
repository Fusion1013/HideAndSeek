package com.jetlag.transit.model;

import java.io.Serializable;
import java.util.Objects;

public class StopTimeId implements Serializable {

  private String tripId;
  private Integer stopSequence;

  public StopTimeId() {
  }

  public StopTimeId(String tripId, Integer stopSequence) {
    this.tripId = tripId;
    this.stopSequence = stopSequence;
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

  @Override
  public boolean equals(Object object) {
    if (this == object) {
      return true;
    }

    if (!(object instanceof StopTimeId other)) {
      return false;
    }

    return Objects.equals(tripId, other.tripId)
      && Objects.equals(stopSequence, other.stopSequence);
  }

  @Override
  public int hashCode() {
    return Objects.hash(tripId, stopSequence);
  }
}
