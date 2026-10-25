package com.jetlag.game;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Converts a play area between the API, a ring of [longitude, latitude] positions as in GeoJSON, and the
 * database, a PostGIS polygon. The ring may be any simple polygon; Create mode draws boxes.
 */
public final class Boundaries {

  private static final GeometryFactory WGS84 = new GeometryFactory(new PrecisionModel(), 4326);
  private static final int MAX_POSITIONS = 1000;

  private Boundaries() {
  }

  /** The ring as a polygon, closed if it was left open. */
  public static Polygon toPolygon(List<List<Double>> ring) {
    if (ring == null || ring.size() < 3) {
      throw new InvalidBoundaryException("The area needs at least three corners");
    }
    if (ring.size() > MAX_POSITIONS) {
      throw new InvalidBoundaryException("The area has more than " + MAX_POSITIONS + " corners");
    }

    List<Coordinate> coordinates = new ArrayList<>(ring.size() + 1);
    for (List<Double> position : ring) {
      coordinates.add(toCoordinate(position));
    }
    if (!coordinates.getFirst().equals2D(coordinates.getLast())) {
      coordinates.add(coordinates.getFirst());
    }
    if (coordinates.size() < 4) {
      throw new InvalidBoundaryException("The area needs at least three corners");
    }

    Polygon polygon = WGS84.createPolygon(coordinates.toArray(Coordinate[]::new));
    if (!polygon.isValid() || polygon.getArea() == 0) {
      throw new InvalidBoundaryException("The area must not cross itself or be empty");
    }
    return polygon;
  }

  /** The polygon's outer ring, closed, as [longitude, latitude] positions. */
  public static List<List<Double>> toRing(Polygon polygon) {
    return Arrays.stream(polygon.getExteriorRing().getCoordinates())
      .map(coordinate -> List.of(coordinate.getX(), coordinate.getY()))
      .toList();
  }

  private static Coordinate toCoordinate(List<Double> position) {
    if (position == null || position.size() != 2 || position.get(0) == null || position.get(1) == null) {
      throw new InvalidBoundaryException("Each corner must be [longitude, latitude]");
    }
    double longitude = position.get(0);
    double latitude = position.get(1);
    if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
      || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      throw new InvalidBoundaryException("Corner out of range: " + position);
    }
    return new Coordinate(longitude, latitude);
  }
}
