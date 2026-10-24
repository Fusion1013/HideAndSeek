package com.jetlag.transit.api;

import com.jetlag.transit.model.ShapeEntity;

import java.util.List;

/** One point of a route shape (GTFS shapes.txt). */
public record ShapePointDTO(
  String shapeId,
  Integer shapePtSequence,
  Double shapePtLat,
  Double shapePtLon,
  Double shapeDistTraveled) {

  public static ShapePointDTO from(ShapeEntity entity) {
    return new ShapePointDTO(
      entity.getShapeId(),
      entity.getShapePtSequence(),
      entity.getShapePtLat(),
      entity.getShapePtLon(),
      entity.getShapeDistTraveled());
  }

  public static List<ShapePointDTO> from(List<ShapeEntity> entities) {
    return entities.stream().map(ShapePointDTO::from).toList();
  }
}
