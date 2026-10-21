package com.jetlag.controller;

import com.jetlag.domain.AgencyEntity;
import com.jetlag.domain.AgencyRouteEntity;
import com.jetlag.repository.AgencyRouteRepository;
import com.jetlag.util.AgencyRouteNotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/agency-routes")
public class AgencyRouteController {

  private final AgencyRouteRepository agencyRouteRepository;

  public AgencyRouteController(
    AgencyRouteRepository agencyRouteRepository
  ) {
    this.agencyRouteRepository = agencyRouteRepository;
  }

  @GetMapping
  @Operation(
    operationId = "getAgencyRoutes",
    summary = "Get all agency routes",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all agency routes",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = AgencyRouteEntity.class))
      )
    )
  )
  public List<AgencyRouteEntity> getAgencyRoutes(@RequestParam(required = false) String agencyId, @RequestParam(required = false) String routeType) {
    if (agencyId != null && routeType != null) {
      return agencyRouteRepository
        .findByAgencyIdAndRouteType(agencyId, routeType);
    }

    if (agencyId != null) {
      return agencyRouteRepository.findByAgencyId(agencyId);
    }

    if (routeType != null) {
      return agencyRouteRepository.findByRouteType(routeType);
    }

    return agencyRouteRepository.findAll();
  }

  @Operation(
    operationId = "getAgencyRoute",
    summary = "Get all agencies",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all agencies",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = AgencyRouteEntity.class))
      )
    )
  )
  @GetMapping("/{routeId}")
  public AgencyRouteEntity getAgencyRoute(@PathVariable String routeId) {
    return agencyRouteRepository.findById(routeId)
      .orElseThrow(() ->
        new AgencyRouteNotFoundException(routeId));
  }
}
