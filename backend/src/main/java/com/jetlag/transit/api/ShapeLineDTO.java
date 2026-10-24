package com.jetlag.transit.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jetlag.transit.repository.RouteNetworkQueries;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.ArrayList;
import java.util.List;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

/** A shape as a line, much smaller than one {@link ShapePointDTO} per point. */
public record ShapeLineDTO(
  @Schema(requiredMode = REQUIRED) String shapeId,
  @Schema(requiredMode = REQUIRED, description = "Points along the shape in order, each [longitude, latitude]")
  List<double[]> coordinates) {

  private static final ObjectMapper JSON = new ObjectMapper();

  public static List<ShapeLineDTO> from(List<RouteNetworkQueries.ShapeLine> lines) {
    return lines.stream().map(ShapeLineDTO::from).filter(line -> line.coordinates().size() >= 2).toList();
  }

  private static ShapeLineDTO from(RouteNetworkQueries.ShapeLine line) {
    try {
      JsonNode coordinates = JSON.readTree(line.geoJson()).path("coordinates");
      List<double[]> points = new ArrayList<>(coordinates.size());
      coordinates.forEach(point -> points.add(new double[] {point.get(0).asDouble(), point.get(1).asDouble()}));
      return new ShapeLineDTO(line.shapeId(), points);
    } catch (Exception e) {
      return new ShapeLineDTO(line.shapeId(), List.of());
    }
  }
}
