package com.jetlag.transit.api;

import com.jetlag.transit.repository.StopTimeRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/stop-times")
public class StopTimeController {

  private final StopTimeRepository stopTimeRepository;

  public StopTimeController(StopTimeRepository stopTimeRepository) {
    this.stopTimeRepository = stopTimeRepository;
  }

  @GetMapping
  @Operation(
    operationId = "getStopTimes",
    summary = "Get all stop times",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all stop times",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopTimeDTO.class))
      )
    )
  )
  public List<StopTimeDTO> getStopTimes() {
    return StopTimeDTO.from(stopTimeRepository.findAll());
  }

  @GetMapping("/stop/{stopId}")
  @Operation(
    operationId = "getStopTimesByStopId",
    summary = "Get stop times for a stop",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of stop times for the requested stop",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopTimeDTO.class))
      )
    )
  )
  public List<StopTimeDTO> getStopTimesByStopId(@PathVariable String stopId) {
    return StopTimeDTO.from(stopTimeRepository.findByStopId(stopId));
  }

  @PostMapping("/by-stop-ids")
  @Operation(
    operationId = "getStopTimesByStopIds",
    summary = "Get stop times for multiple stops",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of stop times for the requested stops",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopTimeDTO.class))
      )
    )
  )
  public List<StopTimeDTO> getStopTimesByStopIds(@RequestBody List<String> stopIds) {
    return StopTimeDTO.from(stopTimeRepository.findByStopIdIn(stopIds));
  }

  @PostMapping("/by-trip-ids")
  @Operation(
    operationId = "getStopTimesByTripIds",
    summary = "Get stop times for multiple trips",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of stop times for the requested trips",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopTimeDTO.class))
      )
    )
  )
  public List<StopTimeDTO> getStopTimesByTripIds(@RequestBody List<String> tripIds) {
    return StopTimeDTO.from(stopTimeRepository.findByTripIdIn(tripIds));
  }
}
