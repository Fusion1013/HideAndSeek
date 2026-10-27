package com.jetlag.places.repository;

import com.jetlag.places.model.OverpassVoronoiCellEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/** Read access to Voronoi cells; they are written by the import with plain SQL. */
public interface OverpassVoronoiCellRepository extends JpaRepository<OverpassVoronoiCellEntity, Long> {

  /** @param tolerance simplification tolerance in degrees; 0 returns the stored cell unchanged */
  @Query(value = """
        SELECT overpass_location_id AS id,
          ST_AsGeoJSON(
            CASE WHEN :tolerance > 0 THEN ST_SimplifyPreserveTopology(geometry, :tolerance) ELSE geometry END,
            6) AS "geoJson"
        FROM overpass_voronoi_cell
        WHERE overpass_location_id IN (:ids)
        """, nativeQuery = true)
  List<OverpassGeometryRepository.GeoJsonRow> findGeoJsonByIdIn(
    @Param("ids") Collection<Long> ids, @Param("tolerance") double tolerance);
}
