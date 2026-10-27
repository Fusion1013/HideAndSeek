package com.jetlag.places.repository;

import com.jetlag.places.model.OsmType;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.model.OverpassLocationCategory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OverpassLocationRepository extends JpaRepository<OverpassLocationEntity, Long> {

  Optional<OverpassLocationEntity> findByOsmTypeAndOsmId(OsmType osmType, long osmId);

  List<OverpassLocationEntity> findByOsmTypeAndOsmIdIn(OsmType osmType, Collection<Long> osmIds);

  List<OverpassLocationEntity> findByCategory(OverpassLocationCategory category);

  List<OverpassLocationEntity> findByCategoryAndLatitudeBetweenAndLongitudeBetween(
    OverpassLocationCategory category, double south, double north, double west, double east);

  Page<OverpassLocationEntity> findByCategory(OverpassLocationCategory category, Pageable pageable);

  Page<OverpassLocationEntity> findByLatitudeBetweenAndLongitudeBetween(
    double south, double north, double west, double east, Pageable pageable);

  Page<OverpassLocationEntity> findByCategoryAndLatitudeBetweenAndLongitudeBetween(
    OverpassLocationCategory category, double south, double north, double west, double east, Pageable pageable);

  /**
   * Places of a category in the bounding box, matched by shape where one is stored: a place is included
   * when its geometry's bounding box overlaps the given one. Places without a stored geometry fall back
   * to their center point.
   */
  @Query(value = """
        SELECT l.* FROM overpass_location l
        LEFT JOIN overpass_geometry g ON g.overpass_location_id = l.id
        WHERE l.category = :category
          AND CASE WHEN g.geometry IS NULL
            THEN l.latitude BETWEEN :south AND :north AND l.longitude BETWEEN :west AND :east
            ELSE g.geometry && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
          END
        """,
    countQuery = """
        SELECT count(*) FROM overpass_location l
        LEFT JOIN overpass_geometry g ON g.overpass_location_id = l.id
        WHERE l.category = :category
          AND CASE WHEN g.geometry IS NULL
            THEN l.latitude BETWEEN :south AND :north AND l.longitude BETWEEN :west AND :east
            ELSE g.geometry && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
          END
        """,
    nativeQuery = true)
  Page<OverpassLocationEntity> findByCategoryIntersecting(
    @Param("category") String category,
    @Param("south") double south, @Param("west") double west,
    @Param("north") double north, @Param("east") double east,
    Pageable pageable);

  /** Places with a Voronoi cell built for the category. */
  @Query(value = """
        SELECT l.* FROM overpass_location l
        JOIN overpass_voronoi_cell c ON c.overpass_location_id = l.id
        WHERE c.category = :category
        """,
    countQuery = """
        SELECT count(*) FROM overpass_voronoi_cell c WHERE c.category = :category
        """,
    nativeQuery = true)
  Page<OverpassLocationEntity> findWithVoronoiCell(@Param("category") String category, Pageable pageable);

  /** Places whose Voronoi cell for the category overlaps the bounding box. */
  @Query(value = """
        SELECT l.* FROM overpass_location l
        JOIN overpass_voronoi_cell c ON c.overpass_location_id = l.id
        WHERE c.category = :category
          AND c.geometry && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
        """,
    countQuery = """
        SELECT count(*) FROM overpass_voronoi_cell c
        WHERE c.category = :category
          AND c.geometry && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
        """,
    nativeQuery = true)
  Page<OverpassLocationEntity> findWithVoronoiCellIntersecting(
    @Param("category") String category,
    @Param("south") double south, @Param("west") double west,
    @Param("north") double north, @Param("east") double east,
    Pageable pageable);

  @Modifying
  @Query("""
        DELETE FROM OverpassLocationEntity overpassLocation
        WHERE overpassLocation.importGeneration <> :generation AND overpassLocation.category = :category
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation, @Param("category") OverpassLocationCategory category);
}
