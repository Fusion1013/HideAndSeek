package com.jetlag.transit.api;

import com.jetlag.transit.model.StopTimeEntity;

import java.util.List;

/** A trip's arrival and departure at one stop (GTFS stop_times.txt). */
public record StopTimeDTO(
  String tripId,
  Integer stopSequence,
  String arrivalTime,
  String departureTime,
  String stopId,
  String locationGroupId,
  String locationId,
  String stopHeadsign,
  String startPickupDropOffWindow,
  String endPickupDropOffWindow,
  Integer pickupType,
  Integer dropOffType,
  Integer continuousPickup,
  Integer continuousDropOff,
  Double shapeDistTraveled,
  Integer timepoint) {

  public static StopTimeDTO from(StopTimeEntity entity) {
    return new StopTimeDTO(
      entity.getTripId(),
      entity.getStopSequence(),
      entity.getArrivalTime(),
      entity.getDepartureTime(),
      entity.getStopId(),
      entity.getLocationGroupId(),
      entity.getLocationId(),
      entity.getStopHeadsign(),
      entity.getStartPickupDropOffWindow(),
      entity.getEndPickupDropOffWindow(),
      entity.getPickupType(),
      entity.getDropOffType(),
      entity.getContinuousPickup(),
      entity.getContinuousDropOff(),
      entity.getShapeDistTraveled(),
      entity.getTimepoint());
  }

  public static List<StopTimeDTO> from(List<StopTimeEntity> entities) {
    return entities.stream().map(StopTimeDTO::from).toList();
  }
}
