package com.jetlag.places.model;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Geometry;

@Entity
@Table(name = "overpass_geometry")
public class OverpassGeometryEntity {

  @Id
  private Long geometryId;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "overpass_location_id")
  private OverpassLocationEntity overpassLocation;

  @Column(nullable = false, columnDefinition = "geometry(Geometry,4326)")
  private Geometry geometry;

  protected OverpassGeometryEntity() {}
  public OverpassGeometryEntity(OverpassLocationEntity overpassLocation) { this.overpassLocation = overpassLocation; }
  public Long getGeometryId() { return geometryId; }
  public OverpassLocationEntity getOverpassLocation() { return overpassLocation; }
  public Geometry getGeometry() { return geometry; }
  public void setGeometry(Geometry geometry) { this.geometry = geometry; }

}
