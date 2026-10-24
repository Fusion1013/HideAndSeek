package com.jetlag.transit.api;

import com.jetlag.transit.model.RouteEntity;

import java.util.List;

/** A transit route (GTFS routes.txt). */
public record RouteDTO(
  String routeId,
  String agencyId,
  String routeShortName,
  String routeLongName,
  String routeType,
  String routeUrl,
  String routeDescription) {

  public static RouteDTO from(RouteEntity entity) {
    return new RouteDTO(
      entity.getRouteId(),
      entity.getAgencyId(),
      entity.getRouteShortName(),
      entity.getRouteLongName(),
      entity.getRouteType(),
      entity.getRouteUrl(),
      entity.getRouteDescription());
  }

  public static List<RouteDTO> from(List<RouteEntity> entities) {
    return entities.stream().map(RouteDTO::from).toList();
  }
}
