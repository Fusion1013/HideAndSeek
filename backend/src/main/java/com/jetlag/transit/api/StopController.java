package com.jetlag.transit.api;

import com.jetlag.transit.repository.StopRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/stops")
public class StopController {

  private final StopRepository stopRepository;

  public StopController(StopRepository stopRepository) {
    this.stopRepository = stopRepository;
  }

  @GetMapping()
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

  @GetMapping("/bounds")
  @Operation(
    operationId = "getStopsWithinBounds",
    summary = "Get stops within geographic bounds",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of stops within the requested bounds",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = StopDTO.class))
      )
    )
  )
  public List<StopDTO> getStopsWithinBounds(
    @RequestParam double minLatitude,
    @RequestParam double maxLatitude,
    @RequestParam double minLongitude,
    @RequestParam double maxLongitude) {
    return StopDTO.from(stopRepository.findWithinBounds(minLatitude, maxLatitude, minLongitude, maxLongitude));
  }
}
