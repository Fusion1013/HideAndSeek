package com.jetlag.places.repository;

import com.jetlag.places.model.OverpassGeometryEntity;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.model.OverpassLocationCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface OverpassGeometryRepository extends JpaRepository<OverpassGeometryEntity, Long> {

  interface GeoJsonRow {
    Long getId();
    String getGeoJson();
  }

  /** @param tolerance simplification tolerance in degrees; 0 returns the stored geometry unchanged */
  @Query(value = """
        SELECT overpass_location_id AS id,
          ST_AsGeoJSON(
            CASE WHEN :tolerance > 0 THEN ST_SimplifyPreserveTopology(geometry, :tolerance) ELSE geometry END,
            6) AS "geoJson"
        FROM overpass_geometry
        WHERE overpass_location_id IN (:ids)
        """, nativeQuery = true)
  List<GeoJsonRow> findGeoJsonByIdIn(@Param("ids") Collection<Long> ids, @Param("tolerance") double tolerance);

  /** Must run before {@link OverpassLocationRepository#deleteNotInGeneration}, which would otherwise violate the FK. */
  @Modifying
  @Query("""
        DELETE FROM OverpassGeometryEntity geometry
        WHERE geometry.geometryId IN (
          SELECT overpassLocation.id FROM OverpassLocationEntity overpassLocation
          WHERE overpassLocation.importGeneration <> :generation AND overpassLocation.category = :category)
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation, @Param("category") OverpassLocationCategory category);
}
