package com.jetlag.transit.reachability;

import java.util.ArrayList;
import java.util.List;

/**
 * The part of a trip's shape that a ride follows: from where its first stop lies on the shape to where its last
 * one does. Each stop is placed on the shape after the one before it, so a shape that passes a place twice (a loop,
 * or out and back on the same street) is cut at the right pass.
 */
final class ShapePath {

  /** A point as latitude and longitude, in degrees. */
  record Point(double latitude, double longitude) {}

  /** A stop further than this from the shape means the shape does not fit the trip; then none is used. */
  static final double MAX_STOP_DISTANCE_METERS = 300;
  /**
   * How much nearer a later pass of the shape must come to a stop to be taken over an earlier one. Stops lie a few
   * metres beside the line, so on a shape that passes twice, the pass that is nearest by a hair is no surer than
   * the first.
   */
  private static final double LATER_PASS_MARGIN_METERS = 30;
  private static final double METERS_PER_DEGREE = 111_195;

  private ShapePath() {
  }

  /** The shape cut from the first stop to the last, or null when the stops do not lie along it. */
  static List<Point> between(List<Point> shape, List<Point> stops) {
    if (shape.size() < 2 || stops.size() < 2) return null;

    Placement first = null;
    Placement last = null;
    int segment = 0;
    double fraction = 0;
    for (Point stop : stops) {
      Placement placement = place(shape, stop, segment, fraction);
      if (placement == null) return null;
      if (first == null) first = placement;
      last = placement;
      segment = placement.segment();
      fraction = placement.fraction();
    }

    List<Point> path = new ArrayList<>();
    path.add(first.point());
    for (int vertex = first.segment() + 1; vertex <= last.segment(); vertex++) {
      path.add(shape.get(vertex));
    }
    path.add(last.point());
    return path;
  }

  /** Where on a segment a stop is placed: the nearest point to it, a fraction of the way along the segment. */
  private record Placement(int segment, double fraction, Point point, double meters) {}

  /**
   * The nearest place to the stop on the shape at or after the given place: the first pass that comes about as
   * near as any, or null if none comes near enough.
   */
  private static Placement place(List<Point> shape, Point stop, int fromSegment, double fromFraction) {
    List<Placement> candidates = new ArrayList<>();
    double nearest = Double.POSITIVE_INFINITY;
    for (int segment = fromSegment; segment < shape.size() - 1; segment++) {
      Placement placement = nearestOnSegment(shape, segment, stop, segment == fromSegment ? fromFraction : 0);
      candidates.add(placement);
      nearest = Math.min(nearest, placement.meters());
    }
    if (nearest > MAX_STOP_DISTANCE_METERS) return null;
    for (Placement placement : candidates) {
      if (placement.meters() <= nearest + LATER_PASS_MARGIN_METERS) return placement;
    }
    return null;
  }

  /** In a flat projection about the stop, which is well within a metre at the scale of a segment. */
  private static Placement nearestOnSegment(List<Point> shape, int segment, Point stop, double minFraction) {
    Point start = shape.get(segment);
    Point end = shape.get(segment + 1);
    double scale = Math.cos(Math.toRadians(stop.latitude()));
    double ax = (start.longitude() - stop.longitude()) * scale;
    double ay = start.latitude() - stop.latitude();
    double dx = (end.longitude() - start.longitude()) * scale;
    double dy = end.latitude() - start.latitude();
    double lengthSquared = dx * dx + dy * dy;
    double fraction = lengthSquared == 0 ? 0 : -(ax * dx + ay * dy) / lengthSquared;
    fraction = Math.max(minFraction, Math.min(1, fraction));
    double x = ax + dx * fraction;
    double y = ay + dy * fraction;
    Point point = new Point(
      start.latitude() + (end.latitude() - start.latitude()) * fraction,
      start.longitude() + (end.longitude() - start.longitude()) * fraction);
    return new Placement(segment, fraction, point, Math.sqrt(x * x + y * y) * METERS_PER_DEGREE);
  }
}
