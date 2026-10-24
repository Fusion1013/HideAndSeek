package com.jetlag.places.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.*;

@Entity
@Table(name = "overpass_location",
  uniqueConstraints = @UniqueConstraint(columnNames = {"osm_type", "osm_id"}),
  indexes = {
    @Index(columnList = "category"),
    @Index(columnList = "latitude, longitude")
  })
public class OverpassLocationEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Enumerated(EnumType.STRING)
  @Column(name = "osm_type", nullable = false)
  private OsmType osmType;

  @Column(name = "osm_id", nullable = false)
  private long osmId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private OverpassLocationCategory category;

  private String subtype;
  private String name;

  @Column(nullable = false)
  private double latitude;

  @Column(nullable = false)
  private double longitude;

  @JdbcTypeCode(SqlTypes.JSON)
  private Map<String, String> tags = new HashMap<>();

  @Column(nullable = false)
  private Instant fetchedAt;

  @Column(name = "import_generation", nullable = false, length = 36)
  private String importGeneration;

  protected OverpassLocationEntity() {} // JPA

  public OverpassLocationEntity(OsmType osmType, long osmId) {
    this.osmType = osmType;
    this.osmId = osmId;
  }

  /** Refreshes mutable fields; used for new places and when the same OSM object is fetched again. */
  public void update(double latitude, double longitude, Map<String, String> tags, String generation) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.tags = new HashMap<>(tags);
    this.name = this.tags.get("name");
    this.category = OverpassLocationCategory.from(this.tags);
    this.subtype = category.subtype(this.tags);
    this.fetchedAt = Instant.now();
    this.importGeneration = generation;
  }

  public Long getId() { return id; }
  public OsmType getOsmType() { return osmType; }
  public long getOsmId() { return osmId; }
  public OverpassLocationCategory getCategory() { return category; }
  public String getSubtype() { return subtype; }
  public String getName() { return name; }
  public double getLatitude() { return latitude; }
  public double getLongitude() { return longitude; }
  public Map<String, String> getTags() { return tags; }
  public Instant getFetchedAt() { return fetchedAt; }
  public String getImportGeneration() {
    return importGeneration;
  }
  public void setImportGeneration(String importGeneration) {
    this.importGeneration = importGeneration;
  }
}
