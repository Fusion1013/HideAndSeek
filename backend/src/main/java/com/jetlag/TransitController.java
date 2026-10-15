package com.jetlag;

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

  private static final VehiclePositionClient client = new VehiclePositionClient();

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
//        return List.of(new VehiclePosition("9031006012602425", "66100000084165775", null, 57.784854888916016, 14.227113723754883, 250.0, 10.300000190734863, null));
          try {
            return client.getVehiclePositions("jlt", "ac323a81f3804340b9eac55377fc7ffe");
          } catch (IOException | InterruptedException e) {
            throw new RuntimeException(e);
          }
        }
}
