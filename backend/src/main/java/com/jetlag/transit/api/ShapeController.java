package com.jetlag.transit.api;

import com.jetlag.transit.repository.RouteNetworkQueries;
import com.jetlag.transit.repository.ShapeRepository;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/shapes")
public class ShapeController {

  /** About a metre: below a pixel even at street level. Clients drawing a wide view can pass a coarser one. */
  private static final double DEFAULT_TOLERANCE = 0.00001;

  private final ShapeRepository shapeRepository;
  private final RouteNetworkQueries routeNetworkQueries;

  public ShapeController(ShapeRepository shapeRepository, RouteNetworkQueries routeNetworkQueries) {
    this.shapeRepository = shapeRepository;
    this.routeNetworkQueries = routeNetworkQueries;
  }

  @GetMapping("/{id}")
  @Operation(
    operationId = "getShapesById",
    summary = "Get all shapes with id",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all shapes with id",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ShapePointDTO.class))
      )
    )
  )
  public List<ShapePointDTO> getShapesById(@PathVariable String id) {
    return ShapePointDTO.from(shapeRepository.findByShapeIdIn(List.of(id)));
  }

  @PostMapping(value = "/batch", consumes = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
    operationId = "getShapesBatch",
    summary = "Get shapes for multiple shape ids",
    requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
      required = true,
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(type = "string"))
      )
    ),
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of shapes matching the requested ids",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ShapePointDTO.class))
      )
    )
  )
  public List<ShapePointDTO> getShapesBatch(@RequestBody List<String> shapeIds) {
    if (shapeIds.isEmpty()) {
      return List.of();
    }
    return ShapePointDTO.from(shapeRepository.findByShapeIdIn(shapeIds));
  }

  @PostMapping(value = "/lines", consumes = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
    operationId = "getShapeLines",
    summary = "Get shapes as simplified lines",
    description = "Each shape as a list of [longitude, latitude] points, simplified so no point moves more than "
      + "the tolerance. Far smaller than the shape points, for drawing many routes at once.",
    requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
      required = true,
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(type = "string"))
      )
    ),
    responses = @ApiResponse(
      responseCode = "200",
      description = "One line per shape that has at least two points",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ShapeLineDTO.class))
      )
    )
  )
  public List<ShapeLineDTO> getShapeLines(
    @RequestBody List<String> shapeIds,
    @io.swagger.v3.oas.annotations.Parameter(description = "Simplification tolerance in degrees; 0 for every point")
    @RequestParam(defaultValue = "" + DEFAULT_TOLERANCE) double tolerance) {
    return ShapeLineDTO.from(routeNetworkQueries.simplifiedLines(shapeIds, tolerance));
  }
}
