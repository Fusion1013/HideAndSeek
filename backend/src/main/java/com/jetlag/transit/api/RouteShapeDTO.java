package com.jetlag.transit.api;

import com.jetlag.transit.repository.RouteNetworkQueries;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

/** One of a route's shapes. */
public record RouteShapeDTO(
  @Schema(requiredMode = REQUIRED) String routeId,
  @Schema(requiredMode = REQUIRED) String shapeId) {

  public static List<RouteShapeDTO> from(List<RouteNetworkQueries.RouteShape> shapes) {
    return shapes.stream().map(shape -> new RouteShapeDTO(shape.routeId(), shape.shapeId())).toList();
  }
}
