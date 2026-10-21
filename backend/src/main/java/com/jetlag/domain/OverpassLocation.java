package com.jetlag.domain;

import com.jetlag.util.OsmType;
import com.jetlag.util.OverpassLocationCategory;
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
public class OverpassLocation {

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

  protected OverpassLocation() {} // JPA

  /** True if the element has a usable position (node lat/lon, or center for ways/relations). */
  public static boolean isStorable(OverpassResponse.Element e) {
    boolean hasPosition = (e.lat() != null && e.lon() != null) || e.center() != null;
    return hasPosition && e.type() != null;
  }

  public static OverpassLocation fromElement(OverpassResponse.Element e, String generation) {
    OverpassLocation p = new OverpassLocation();
    p.osmType = OsmType.fromOverpass(e.type());
    p.osmId = e.id();
    p.updateFrom(e, generation);
    return p;
  }

  /** Refreshes mutable fields; used when the same OSM object is fetched again. */
  public void updateFrom(OverpassResponse.Element e, String generation) {
    if (!isStorable(e)) {
      throw new IllegalArgumentException("Element " + e.type() + "/" + e.id() + " has no coordinates");
    }
    if (e.lat() != null && e.lon() != null) {
      this.latitude = e.lat();
      this.longitude = e.lon();
    } else {
      this.latitude = e.center().lat();
      this.longitude = e.center().lon();
    }
    this.tags = e.tags() == null ? new HashMap<>() : new HashMap<>(e.tags());
    this.name = tags.get("name");
    this.category = OverpassLocationCategory.from(tags);
    this.subtype = category.subtype(tags);
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
