package com.jetlag.transit.api;

import com.jetlag.transit.reachability.ReachabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/reachability")
public class ReachabilityController {

  private final ReachabilityService reachabilityService;

  public ReachabilityController(ReachabilityService reachabilityService) {
    this.reachabilityService = reachabilityService;
  }

  @GetMapping
  @Operation(
    operationId = "getReachableStations",
    summary = "Get the stations reachable from a station within a time, by public transport and on foot",
    responses = @ApiResponse(
      responseCode = "200",
      description = "The reachable stations, by earliest arrival",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ReachableStationDTO.class))
      )
    )
  )
  public List<ReachableStationDTO> getReachableStations(
    @RequestParam String stopId,
    @Parameter(description = "Day to travel, as YYYY-MM-DD; today in Sweden when left out")
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
    @Parameter(description = "Time of day to leave, as HH:MM") @RequestParam String startTime,
    @Parameter(description = "Minutes to travel, at most " + ReachabilityService.MAX_DURATION_MINUTES)
    @RequestParam int durationMinutes) {
    return reachabilityService.reachableStations(stopId, date, startTime, durationMinutes);
  }

  @GetMapping("/routes")
  @Operation(
    operationId = "getReachabilityRoutes",
    summary = "Get the quickest route to each of some reachable stations, for the same search as the reachable stations",
    responses = @ApiResponse(
      responseCode = "200",
      description = "A route to each station that can be reached in time, in the order asked for",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ReachabilityRouteDTO.class))
      )
    )
  )
  public List<ReachabilityRouteDTO> getReachabilityRoutes(
    @RequestParam String stopId,
    @Parameter(description = "Day to travel, as YYYY-MM-DD; today in Sweden when left out")
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
    @Parameter(description = "Time of day to leave, as HH:MM") @RequestParam String startTime,
    @Parameter(description = "Minutes to travel, at most " + ReachabilityService.MAX_DURATION_MINUTES)
    @RequestParam int durationMinutes,
    @Parameter(description = "The stations to route to, at most " + ReachabilityService.MAX_ROUTE_TARGETS)
    @RequestParam List<String> targetStopIds) {
    return reachabilityService.routes(stopId, date, startTime, durationMinutes, targetStopIds);
  }
}
