package com.jetlag.transit.api;

import com.jetlag.transit.model.AgencyRouteEntity;

import java.util.List;

/** A route together with the agency that runs it. */
public record AgencyRouteDTO(
  String routeId,
  String agencyId,
  String agencyFareUrl,
  String agencyLang,
  String agencyName,
  String agencyTimezone,
  String agencyUrl,
  String routeDescription,
  String routeShortName,
  String routeLongName,
  String routeType) {

  public static AgencyRouteDTO from(AgencyRouteEntity entity) {
    return new AgencyRouteDTO(
      entity.getRouteId(),
      entity.getAgencyId(),
      entity.getAgencyFareUrl(),
      entity.getAgencyLang(),
      entity.getAgencyName(),
      entity.getAgencyTimezone(),
      entity.getAgencyUrl(),
      entity.getRouteDescription(),
      entity.getRouteShortName(),
      entity.getRouteLongName(),
      entity.getRouteType());
  }

  public static List<AgencyRouteDTO> from(List<AgencyRouteEntity> entities) {
    return entities.stream().map(AgencyRouteDTO::from).toList();
  }
}
