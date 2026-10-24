package com.jetlag.transit.realtime;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/transit")
@Tag(name = "Transit")
public class TransitController {

  private final VehiclePositionClient client;

  public TransitController(VehiclePositionClient client) {
    this.client = client;
  }

  @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
    operationId = "getVehiclePositions",
    summary = "Get current vehicle positions",
    responses = @ApiResponse(
      responseCode = "200",
      description = "Current vehicle positions",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = VehiclePosition.class))
      )
    )
  )
  public List<VehiclePosition> getVehiclePositions() {
    try {
      return client.getVehiclePositions();
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }
}
