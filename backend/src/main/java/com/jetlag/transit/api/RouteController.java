package com.jetlag.transit.api;

import com.jetlag.transit.repository.RouteNetworkQueries;
import com.jetlag.transit.repository.RouteRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/routes")
public class RouteController {

  private final RouteRepository routeRepository;
  private final RouteNetworkQueries routeNetworkQueries;

  public RouteController(RouteRepository routeRepository, RouteNetworkQueries routeNetworkQueries) {
    this.routeRepository = routeRepository;
    this.routeNetworkQueries = routeNetworkQueries;
  }

  @GetMapping
  @Operation(
    operationId = "getRoutes",
    summary = "Get all routes",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all routes",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = RouteDTO.class))
      )
    )
  )
  public List<RouteDTO> getRoutes() {
    return RouteDTO.from(routeRepository.findAll());
  }

  @GetMapping("/bounds")
  @Operation(
    operationId = "getRouteIdsWithinBounds",
    summary = "Get the routes serving stops within geographic bounds",
    description = "Ids of every route with a trip calling at a stop inside the bounds, without the stop times "
      + "themselves; answers \"which routes run here\" for large areas in a single query.",
    responses = @ApiResponse(
      responseCode = "200",
      description = "Route ids, sorted",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = String.class))
      )
    )
  )
  public List<String> getRouteIdsWithinBounds(
    @RequestParam double minLatitude,
    @RequestParam double maxLatitude,
    @RequestParam double minLongitude,
    @RequestParam double maxLongitude) {
    return routeRepository.findRouteIdsServingStopsWithinBounds(minLatitude, maxLatitude, minLongitude, maxLongitude);
  }

  @PostMapping(value = "/stop-ids", consumes = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
    operationId = "getStopIdsForRoutes",
    summary = "Get the stops served by a set of routes",
    description = "Ids of every stop where a trip of one of the routes calls, in one query however many routes.",
    requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
      required = true,
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(type = "string"))
      )
    ),
    responses = @ApiResponse(
      responseCode = "200",
      description = "Stop ids, sorted",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(type = "string"))
      )
    )
  )
  public List<String> getStopIdsForRoutes(@RequestBody List<String> routeIds) {
    return routeNetworkQueries.stopIdsServedBy(routeIds);
  }

  @PostMapping(value = "/shape-ids", consumes = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
    operationId = "getShapeIdsForRoutes",
    summary = "Get the shapes of a set of routes",
    description = "The distinct shapes the routes' trips follow, in one query however many routes.",
    requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
      required = true,
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(type = "string"))
      )
    ),
    responses = @ApiResponse(
      responseCode = "200",
      description = "Route and shape id pairs",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = RouteShapeDTO.class))
      )
    )
  )
  public List<RouteShapeDTO> getShapeIdsForRoutes(@RequestBody List<String> routeIds) {
    return RouteShapeDTO.from(routeNetworkQueries.shapesOf(routeIds));
  }
}
