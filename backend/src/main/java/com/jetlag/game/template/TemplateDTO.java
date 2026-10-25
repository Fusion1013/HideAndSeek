package com.jetlag.game.template;

import com.jetlag.game.Boundaries;
import com.jetlag.game.RouteSnapshot;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record TemplateDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
  @Schema(description = "The play area's outline as a closed ring of [longitude, latitude] positions",
    requiredMode = Schema.RequiredMode.REQUIRED)
  List<List<Double>> boundary,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
  List<TemplateRouteDTO> routes,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt
) {

  /** A chosen route, with the names it had when chosen. */
  public record TemplateRouteDTO(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String routeId,
    String routeShortName,
    String agencyName,
    String routeType,
    @Schema(description = "False once a GTFS import no longer has the route", requiredMode = Schema.RequiredMode.REQUIRED)
    boolean available
  ) {
  }

  /** {@code currentRouteIds}: which of the template's routes the GTFS data still has. */
  static TemplateDTO from(GameTemplateEntity template, Set<String> currentRouteIds) {
    List<TemplateRouteDTO> routes = template.getRoutes().stream()
      .sorted(Comparator.comparing(RouteSnapshot::routeId))
      .map(route -> new TemplateRouteDTO(route.routeId(), route.routeShortName(), route.agencyName(), route.routeType(),
        currentRouteIds.contains(route.routeId())))
      .toList();
    return new TemplateDTO(template.getId(), template.getName(), Boundaries.toRing(template.getBoundary()), routes,
      template.getCreatedAt(), template.getUpdatedAt());
  }
}
