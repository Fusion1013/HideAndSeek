package com.jetlag.repository;

import com.jetlag.domain.OverpassLocation;
import com.jetlag.util.OsmType;
import com.jetlag.util.OverpassLocationCategory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OverpassLocationRepository extends JpaRepository<OverpassLocation, Long> {

  Optional<OverpassLocation> findByOsmTypeAndOsmId(OsmType osmType, long osmId);

  List<OverpassLocation> findByOsmTypeAndOsmIdIn(OsmType osmType, Collection<Long> osmIds);

  List<OverpassLocation> findByCategory(OverpassLocationCategory category);

  List<OverpassLocation> findByCategoryAndLatitudeBetweenAndLongitudeBetween(
    OverpassLocationCategory category, double south, double north, double west, double east);

  Page<OverpassLocation> findByCategory(OverpassLocationCategory category, Pageable pageable);

  Page<OverpassLocation> findByLatitudeBetweenAndLongitudeBetween(
    double south, double north, double west, double east, Pageable pageable);

  Page<OverpassLocation> findByCategoryAndLatitudeBetweenAndLongitudeBetween(
    OverpassLocationCategory category, double south, double north, double west, double east, Pageable pageable);

  @Modifying
  @Query("""
        DELETE FROM OverpassLocation overpassLocation
        WHERE overpassLocation.importGeneration <> :generation AND overpassLocation.category = :category
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation, @Param("category") OverpassLocationCategory category);
}
