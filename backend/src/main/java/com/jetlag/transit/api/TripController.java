package com.jetlag.transit.api;

import com.jetlag.transit.repository.TripRepository;
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
@RequestMapping("/api/trips")
public class TripController {

  private final TripRepository tripRepository;

  public TripController(TripRepository tripRepository) {
    this.tripRepository = tripRepository;
  }

  @GetMapping
  @Operation(
    operationId = "getTrips",
    summary = "Get all trips",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all trips",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = TripDTO.class))
      )
    )
  )
  public List<TripDTO> getTrips() {
    return TripDTO.from(tripRepository.findAll());
  }

  @GetMapping("/route/{id}")
  @Operation(
    operationId = "getTripsByRouteId",
    summary = "Get all trips by route",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all trips by route",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = TripDTO.class))
      )
    )
  )
  public List<TripDTO> getTripsByRouteId(@PathVariable String id) {
    return TripDTO.from(tripRepository.findByRouteId(id));
  }

  @PostMapping("/by-ids")
  @Operation(
    operationId = "getTripsByTripIds",
    summary = "Get trips by trip IDs",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of trips matching the requested IDs",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = TripDTO.class))
      )
    )
  )
  public List<TripDTO> getTripsByTripIds(@RequestBody List<String> tripIds) {
    return TripDTO.from(tripRepository.findAllById(tripIds));
  }
}
