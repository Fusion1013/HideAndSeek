package com.jetlag.controller;

import com.jetlag.domain.RouteEntity;
import com.jetlag.domain.StopEntity;
import com.jetlag.repository.RouteRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/routes")
public class RouteController {

  private final RouteRepository routeRepository;

  public RouteController(RouteRepository routeRepository) {
    this.routeRepository = routeRepository;
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
        array = @ArraySchema(schema = @Schema(implementation = RouteEntity.class))
      )
    )
  )
  public List<RouteEntity> getRoutes() {
    return routeRepository.findAll();
  }
}
