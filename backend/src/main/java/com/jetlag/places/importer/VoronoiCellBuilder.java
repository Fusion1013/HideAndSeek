package com.jetlag.places.importer;

import org.locationtech.jts.densify.Densifier;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.triangulate.VoronoiDiagramBuilder;

import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Splits the area around a set of places into the cells where each place is the closest one (a Voronoi
 * diagram). Works on projected coordinates in meters, where straight-line distance is close to true distance.
 */
final class VoronoiCellBuilder {

  /** Places closer together than this share one cell, which goes to the one with the lowest id. */
  static final double TOLERANCE_METERS = 1;

  /**
   * Cell edges get a vertex at least this often, so they stay close to straight in the projection they were
   * built in once transformed back to longitude and latitude.
   */
  static final double DENSIFY_METERS = 2_000;

  private VoronoiCellBuilder() {}

  /** A place, by id, at a projected position. */
  record Site(long id, double x, double y) {}

  /**
   * @param margin how far, in meters, the outermost cells reach beyond the outermost places; cells are
   *               otherwise unbounded
   * @return each place's cell, keyed by place id. Places sharing a position with another get none.
   */
  static Map<Long, Polygon> build(List<Site> sites, double margin, GeometryFactory factory) {
    if (sites.isEmpty()) return Map.of();

    Map<Coordinate, Long> idBySite = new LinkedHashMap<>();
    Envelope envelope = new Envelope();
    sites.stream()
      .sorted(Comparator.comparingLong(Site::id))
      .forEach(site -> {
        Coordinate coordinate = new Coordinate(site.x(), site.y());
        idBySite.putIfAbsent(coordinate, site.id());
        envelope.expandToInclude(coordinate);
      });
    envelope.expandBy(margin);

    // A lone place is closest everywhere
    if (idBySite.size() == 1) {
      return Map.of(idBySite.values().iterator().next(), densify((Polygon) factory.toGeometry(envelope)));
    }

    VoronoiDiagramBuilder builder = new VoronoiDiagramBuilder();
    builder.setSites(idBySite.keySet());
    builder.setTolerance(TOLERANCE_METERS);
    builder.setClipEnvelope(envelope);
    Geometry diagram = builder.getDiagram(factory);

    Map<Long, Polygon> cells = new HashMap<>();
    for (int i = 0; i < diagram.getNumGeometries(); i++) {
      Geometry cell = diagram.getGeometryN(i);
      // Each cell carries the position of the place it was built around
      Long id = cell.getUserData() instanceof Coordinate site ? idBySite.get(site) : null;
      if (id != null && cell instanceof Polygon polygon && !polygon.isEmpty()) cells.put(id, densify(polygon));
    }
    return cells;
  }

  private static Polygon densify(Polygon polygon) {
    return (Polygon) Densifier.densify(polygon, DENSIFY_METERS);
  }
}
