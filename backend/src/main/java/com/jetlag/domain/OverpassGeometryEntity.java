package com.jetlag.domain;

import com.jetlag.util.OverpassLocationCategory;
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
  private OverpassLocation overpassLocation;

  @Column(nullable = false, columnDefinition = "geometry(Geometry,4326)")
  private Geometry geometry;

  protected OverpassGeometryEntity() {}
  public OverpassGeometryEntity(OverpassLocation overpassLocation) { this.overpassLocation = overpassLocation; }
  public void setGeometry(Geometry geometry) { this.geometry = geometry; }

}
