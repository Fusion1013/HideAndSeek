package com.jetlag.transit.api;

import com.jetlag.transit.model.ShapeEntity;
import org.locationtech.jts.geom.Coordinate;

import java.util.List;
import java.util.stream.IntStream;

/** One point of a route shape (GTFS shapes.txt). */
public record ShapePointDTO(
  String shapeId,
  /** The point's position along the shape, counting from 1. */
  Integer shapePtSequence,
  Double shapePtLat,
  Double shapePtLon,
  /** Not stored; always null. */
  Double shapeDistTraveled) {

  /** Each shape's points, in order. */
  public static List<ShapePointDTO> from(List<ShapeEntity> shapes) {
    return shapes.stream().flatMap(shape -> {
      Coordinate[] coordinates = shape.getGeometry().getCoordinates();
      return IntStream.range(0, coordinates.length).mapToObj(index ->
        new ShapePointDTO(shape.getShapeId(), index + 1, coordinates[index].y, coordinates[index].x, null));
    }).toList();
  }
}
