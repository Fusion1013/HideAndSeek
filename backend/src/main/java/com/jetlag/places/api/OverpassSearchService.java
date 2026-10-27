package com.jetlag.places.api;

import com.jetlag.common.Bounds;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.model.OverpassLocationCategory;
import com.jetlag.places.repository.OverpassGeometryRepository;
import com.jetlag.places.repository.OverpassLocationRepository;
import com.jetlag.places.repository.OverpassVoronoiCellRepository;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/** Read access to imported places, for the API. */
@Service
class OverpassSearchService {

  private final OverpassLocationRepository overpassLocationRepository;
  private final OverpassGeometryRepository overpassGeometryRepository;
  private final OverpassVoronoiCellRepository overpassVoronoiCellRepository;

  OverpassSearchService(OverpassLocationRepository overpassLocationRepository,
                        OverpassGeometryRepository overpassGeometryRepository,
                        OverpassVoronoiCellRepository overpassVoronoiCellRepository) {
    this.overpassLocationRepository = overpassLocationRepository;
    this.overpassGeometryRepository = overpassGeometryRepository;
    this.overpassVoronoiCellRepository = overpassVoronoiCellRepository;
  }

  /**
   * @param matchShapes with a category and bounds, match places by their stored geometry rather than their
   *                    center point, so long lines and large areas that cross the bounds are included
   */
  @Transactional
  public Page<OverpassLocationEntity> search(
    OverpassLocationCategory category, Bounds bounds, boolean matchShapes, Pageable pageable) {
    if (category != null && bounds != null && matchShapes) {
      return overpassLocationRepository.findByCategoryIntersecting(
        category.name(), bounds.south(), bounds.west(), bounds.north(), bounds.east(), pageable);
    }
    if (category != null && bounds != null) {
      return overpassLocationRepository.findByCategoryAndLatitudeBetweenAndLongitudeBetween(
        category, bounds.south(), bounds.north(), bounds.west(), bounds.east(), pageable);
    }
    if (category != null) {
      return overpassLocationRepository.findByCategory(category, pageable);
    }
    if (bounds != null) {
      return overpassLocationRepository.findByLatitudeBetweenAndLongitudeBetween(
        bounds.south(), bounds.north(), bounds.west(), bounds.east(), pageable);
    }
    return overpassLocationRepository.findAll(pageable);
  }

  /**
   * GeoJSON geometries for the given locations, keyed by location id. Locations without geometry are absent.
   *
   * @param tolerance simplification tolerance in degrees; 0 for full detail
   */
  @Transactional
  public Map<Long, String> findGeoJson(Collection<Long> locationIds, double tolerance) {
    if (locationIds.isEmpty()) return Map.of();
    return overpassGeometryRepository.findGeoJsonByIdIn(locationIds, Math.max(tolerance, 0)).stream()
      .collect(Collectors.toMap(
        OverpassGeometryRepository.GeoJsonRow::getId, OverpassGeometryRepository.GeoJsonRow::getGeoJson));
  }

  /** Places of a category with a Voronoi cell, optionally only those whose cell overlaps the bounds. */
  @Transactional
  public Page<OverpassLocationEntity> searchWithVoronoiCell(
    OverpassLocationCategory category, Bounds bounds, Pageable pageable) {
    if (bounds == null) return overpassLocationRepository.findWithVoronoiCell(category.name(), pageable);
    return overpassLocationRepository.findWithVoronoiCellIntersecting(
      category.name(), bounds.south(), bounds.west(), bounds.north(), bounds.east(), pageable);
  }

  /**
   * GeoJSON Voronoi cells for the given places, keyed by place id.
   *
   * @param tolerance simplification tolerance in degrees; 0 for full detail
   */
  @Transactional
  public Map<Long, String> findVoronoiCellGeoJson(Collection<Long> locationIds, double tolerance) {
    if (locationIds.isEmpty()) return Map.of();
    return overpassVoronoiCellRepository.findGeoJsonByIdIn(locationIds, Math.max(tolerance, 0)).stream()
      .collect(Collectors.toMap(
        OverpassGeometryRepository.GeoJsonRow::getId, OverpassGeometryRepository.GeoJsonRow::getGeoJson));
  }

  @Transactional
  public Optional<OverpassLocationEntity> findById(Long id) {
    return overpassLocationRepository.findById(id);
  }
}
