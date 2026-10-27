package com.jetlag.places.model;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Polygon;

/**
 * The area around a place where it is the closest place of its category: one cell of the category's Voronoi
 * diagram. Built after each import of a point category (see OverpassVoronoiService).
 */
@Entity
@Table(name = "overpass_voronoi_cell", indexes = @Index(columnList = "category"))
public class OverpassVoronoiCellEntity {

  @Id
  private Long cellId;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "overpass_location_id")
  private OverpassLocationEntity overpassLocation;

  /** The category the diagram was built for; the place's own category can change on a later import. */
  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private OverpassLocationCategory category;

  @Column(nullable = false, columnDefinition = "geometry(Polygon,4326)")
  private Polygon geometry;

  protected OverpassVoronoiCellEntity() {}
  public Long getCellId() { return cellId; }
  public OverpassLocationEntity getOverpassLocation() { return overpassLocation; }
  public OverpassLocationCategory getCategory() { return category; }
  public Polygon getGeometry() { return geometry; }

}
