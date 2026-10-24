package com.jetlag.transit.api;

import com.jetlag.transit.repository.AgencyRouteRepository;
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
        array = @ArraySchema(schema = @Schema(implementation = AgencyRouteDTO.class))
      )
    )
  )
  public List<AgencyRouteDTO> getAgencyRoutes(@RequestParam(required = false) String agencyId, @RequestParam(required = false) String routeType) {
    if (agencyId != null && routeType != null) {
      return AgencyRouteDTO.from(agencyRouteRepository
        .findByAgencyIdAndRouteType(agencyId, routeType));
    }

    if (agencyId != null) {
      return AgencyRouteDTO.from(agencyRouteRepository.findByAgencyId(agencyId));
    }

    if (routeType != null) {
      return AgencyRouteDTO.from(agencyRouteRepository.findByRouteType(routeType));
    }

    return AgencyRouteDTO.from(agencyRouteRepository.findAll());
  }

  @Operation(
    operationId = "getAgencyRoute",
    summary = "Get a route with its agency",
    responses = @ApiResponse(
      responseCode = "200",
      description = "The route",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        schema = @Schema(implementation = AgencyRouteDTO.class)
      )
    )
  )
  @GetMapping("/{routeId}")
  public AgencyRouteDTO getAgencyRoute(@PathVariable String routeId) {
    return AgencyRouteDTO.from(agencyRouteRepository.findById(routeId)
      .orElseThrow(() ->
        new AgencyRouteNotFoundException(routeId)));
  }
}
