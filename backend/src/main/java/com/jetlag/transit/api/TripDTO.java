package com.jetlag.transit.api;

import com.jetlag.transit.model.TripEntity;

import java.util.List;

/** A trip along a route (GTFS trips.txt). */
public record TripDTO(
  String tripId,
  String routeId,
  String serviceId,
  String tripHeadsign,
  String tripShortName,
  Integer directionId,
  String blockId,
  String shapeId,
  Integer wheelchairAccessible,
  Integer bikesAllowed) {

  public static TripDTO from(TripEntity entity) {
    return new TripDTO(
      entity.getTripId(),
      entity.getRouteId(),
      entity.getServiceId(),
      entity.getTripHeadsign(),
      entity.getTripShortName(),
      entity.getDirectionId(),
      entity.getBlockId(),
      entity.getShapeId(),
      entity.getWheelchairAccessible(),
      entity.getBikesAllowed());
  }

  public static List<TripDTO> from(List<TripEntity> entities) {
    return entities.stream().map(TripDTO::from).toList();
  }
}
