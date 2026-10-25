package com.jetlag.game;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * A route chosen for a template or game. Only the ID refers to the GTFS data, and a later import may remove it;
 * the names are copied at the time so the route can still be shown.
 */
@Embeddable
public record RouteSnapshot(
  @Column(name = "route_id", nullable = false) String routeId,
  @Column(name = "route_short_name") String routeShortName,
  @Column(name = "agency_name") String agencyName,
  @Column(name = "route_type") String routeType
) {
}
