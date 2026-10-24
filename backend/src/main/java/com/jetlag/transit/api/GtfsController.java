package com.jetlag.transit.api;

import com.jetlag.transit.repository.RouteRepository;
import com.jetlag.transit.repository.StopRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/gtfs")
public class GtfsController {

  private final StopRepository stopRepository;
  private final RouteRepository routeRepository;

  public GtfsController(
    StopRepository stopRepository,
    RouteRepository routeRepository
  ) {
    this.stopRepository = stopRepository;
    this.routeRepository = routeRepository;
  }

  @GetMapping("/stops")
  @Operation(
    operationId = "getStops",
    summary = "Get all stops",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all stops",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopDTO.class))
      )
    )
  )
  public List<StopDTO> getStops() {
    return StopDTO.from(stopRepository.findAll());
  }

  @GetMapping("/routes")
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

  @GetMapping("/route/{id}")
  @Operation(
    responses = @ApiResponse(
      responseCode = "200",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        schema = @Schema(implementation = RouteDTO.class)
      )
    )
  )
  public RouteDTO getRoute(@PathVariable String id) {
    return routeRepository.findById(id).map(RouteDTO::from).orElse(null);
  }
}
