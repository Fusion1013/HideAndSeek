package com.jetlag.controller;

import com.jetlag.domain.RouteEntity;
import com.jetlag.domain.StopEntity;
import com.jetlag.repository.RouteRepository;
import com.jetlag.repository.StopRepository;
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
        array = @ArraySchema(schema = @Schema(implementation = StopEntity.class))
      )
    )
  )
  public List<StopEntity> getStops() {
    return stopRepository.findAll();
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
        array = @ArraySchema(schema = @Schema(implementation = RouteEntity.class))
      )
    )
  )
  public List<RouteEntity> getRoutes() {
    return routeRepository.findAll();
  }

  @GetMapping("/route/{id}")
  @Operation(
    responses = @ApiResponse(
      responseCode = "200",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        schema = @Schema(implementation = RouteEntity.class)
      )
    )
  )
  public RouteEntity getRoute(@PathVariable String id) {
    return routeRepository.findById(id).orElse(null);
  }
}
