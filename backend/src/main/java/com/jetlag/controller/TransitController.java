package com.jetlag.controller;

import com.jetlag.domain.VehiclePosition;
import com.jetlag.service.VehiclePositionClient;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

  private static final VehiclePositionClient client = new VehiclePositionClient();
  private static final Logger log = LoggerFactory.getLogger(TransitController.class);

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
      return client.getVehiclePositions("jlt", "ac323a81f3804340b9eac55377fc7ffe");
    } catch (IOException | InterruptedException e) {
      throw new RuntimeException(e);
    }
  }
}
