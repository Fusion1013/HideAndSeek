package com.jetlag.transit.api;

import com.jetlag.transit.model.StopEntity;

import java.util.List;

/** A stop or station (GTFS stops.txt). */
public record StopDTO(
  String stopId,
  String stopCode,
  String stopName,
  String stopDescription,
  Double latitude,
  Double longitude,
  String zoneId,
  String stopUrl,
  Integer locationType,
  String parentStation,
  Integer wheelchairBoarding,
  String levelId,
  String platformCode) {

  public static StopDTO from(StopEntity entity) {
    return new StopDTO(
      entity.getStopId(),
      entity.getStopCode(),
      entity.getStopName(),
      entity.getStopDescription(),
      entity.getLatitude(),
      entity.getLongitude(),
      entity.getZoneId(),
      entity.getStopUrl(),
      entity.getLocationType(),
      entity.getParentStation(),
      entity.getWheelchairBoarding(),
      entity.getLevelId(),
      entity.getPlatformCode());
  }

  public static List<StopDTO> from(List<StopEntity> entities) {
    return entities.stream().map(StopDTO::from).toList();
  }
}
