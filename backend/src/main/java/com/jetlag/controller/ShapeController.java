package com.jetlag.controller;

import com.jetlag.domain.ShapeEntity;
import com.jetlag.repository.ShapeRepository;
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
@RequestMapping("api/shapes")
public class ShapeController {

  private final ShapeRepository shapeRepository;

  public ShapeController(ShapeRepository shapeRepository) {
    this.shapeRepository = shapeRepository;
  }

  @GetMapping
  @Operation(
    operationId = "getShapes",
    summary = "Get all shapes",
    responses = @ApiResponse(
      responseCode = "200",
      description = "List of all shapes",
      content = @Content(
        mediaType = MediaType.APPLICATION_JSON_VALUE,
        array = @ArraySchema(schema = @Schema(implementation = ShapeEntity.class))
      )
    )
  )
  public List<ShapeEntity> getShapes() {
    return shapeRepository.findAll();
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
        array = @ArraySchema(schema = @Schema(implementation = ShapeEntity.class))
      )
    )
  )
  public List<ShapeEntity> getShapesById(@PathVariable String id) {
    return shapeRepository.findByShapeId(id);
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
        array = @ArraySchema(schema = @Schema(implementation = ShapeEntity.class))
      )
    )
  )
  public List<ShapeEntity> getShapesBatch(@RequestBody List<String> shapeIds) {
    if (shapeIds.isEmpty()) {
      return List.of();
    }
    return shapeRepository.findByShapeIdIn(shapeIds);
  }
}
