package com.jetlag.transit.api;

import com.jetlag.transit.model.AgencyEntity;

import java.util.List;

/** A transit agency (GTFS agency.txt). */
public record AgencyDTO(
  String agencyId,
  String agencyName,
  String agencyUrl,
  String agencyTimezone,
  String agencyLang,
  String agencyFareUrl) {

  public static AgencyDTO from(AgencyEntity entity) {
    return new AgencyDTO(
      entity.getAgencyId(),
      entity.getAgencyName(),
      entity.getAgencyUrl(),
      entity.getAgencyTimezone(),
      entity.getAgencyLang(),
      entity.getAgencyFareUrl());
  }

  public static List<AgencyDTO> from(List<AgencyEntity> entities) {
    return entities.stream().map(AgencyDTO::from).toList();
  }
}
