package com.jetlag.places.importer;

import com.jetlag.places.model.OsmType;
import com.jetlag.places.model.OverpassGeometryEntity;
import com.jetlag.places.model.OverpassLocationEntity;
import com.jetlag.places.model.OverpassLocationCategory;
import com.jetlag.places.repository.OverpassGeometryRepository;
import com.jetlag.places.repository.OverpassLocationRepository;
import jakarta.transaction.Transactional;
import org.locationtech.jts.geom.Geometry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Imports one category from Overpass, upserting its places and geometries and removing ones no longer there. */
@Service
class OverpassImportService {

  private static final int LOOKUP_CHUNK_SIZE = 1000;
  private static final Logger logger = LoggerFactory.getLogger(OverpassImportService.class);

  private final OverpassClient overpassClient;
  private final OverpassLocationRepository overpassLocationRepository;
  private final OverpassGeometryRepository overpassGeometryRepository;

  OverpassImportService(OverpassClient overpassClient, OverpassLocationRepository overpassLocationRepository,
                        OverpassGeometryRepository overpassGeometryRepository) {
    this.overpassClient = overpassClient;
    this.overpassLocationRepository = overpassLocationRepository;
    this.overpassGeometryRepository = overpassGeometryRepository;
  }

  @Transactional
  public int updateOverpassData(String generation, OverpassLocationCategory category) {
    int nImported = 0;

    nImported += update(category, generation);

    overpassGeometryRepository.deleteNotInGeneration(generation, category);
    int nDeleted = overpassLocationRepository.deleteNotInGeneration(generation, category);

    return nImported;
  }

  private int update(OverpassLocationCategory category, String generation) {
    OverpassResponse response = overpassClient.fetch(category);
    saveAll(response, category, generation);
    return response.elements().size();
  }

  private List<OverpassLocationEntity> saveAll(OverpassResponse response, OverpassLocationCategory category, String generation) {
    if (response == null || response.elements() == null) return List.of();

    // Geometry-mode responses carry no center, so the location's position is derived from the geometry
    Map<OverpassResponse.Element, Geometry> geometries = new IdentityHashMap<>();
    List<OverpassResponse.Element> storable = new ArrayList<>();
    for (OverpassResponse.Element e : response.elements()) {
      if (category.hasGeometry()) {
        Optional<Geometry> geometry = OverpassGeometryBuilder.build(e);
        if (geometry.isPresent()) {
          if (!hasPosition(e)) e = e.withCenter(OverpassGeometryBuilder.center(geometry.get()));
          geometries.put(e, geometry.get());
        }
      }
      if (hasPosition(e)) storable.add(e);
    }

    Map<OsmType, List<OverpassResponse.Element>> byType = storable.stream()
      .collect(Collectors.groupingBy(e -> OsmType.fromOverpass(e.type())));

    List<OverpassLocationEntity> toSave = new ArrayList<>();
    Map<OverpassLocationEntity, Geometry> locationGeometries = new IdentityHashMap<>();
    byType.forEach((type, elements) -> {
      // Chunked: PostgreSQL allows at most 65 535 bind parameters per statement
      List<Long> osmIds = elements.stream().map(OverpassResponse.Element::id).toList();
      Map<Long, OverpassLocationEntity> existing = new HashMap<>();
      for (int i = 0; i < osmIds.size(); i += LOOKUP_CHUNK_SIZE) {
        overpassLocationRepository
          .findByOsmTypeAndOsmIdIn(type, osmIds.subList(i, Math.min(i + LOOKUP_CHUNK_SIZE, osmIds.size())))
          .forEach(location -> existing.put(location.getOsmId(), location));
      }

      for (OverpassResponse.Element e : elements) {
        OverpassLocationEntity place = existing.get(e.id());
        if (place == null) place = new OverpassLocationEntity(type, e.id());
        update(place, e, generation);
        toSave.add(place);
        Geometry geometry = geometries.get(e);
        if (geometry != null) locationGeometries.put(place, geometry);
      }
    });
    List<OverpassLocationEntity> saved = overpassLocationRepository.saveAll(toSave);
    if (category.hasGeometry()) saveGeometries(saved, locationGeometries);
    return saved;
  }

  private void saveGeometries(List<OverpassLocationEntity> locations, Map<OverpassLocationEntity, Geometry> geometries) {
    logger.info("Saving {} geometries", geometries.size());
    List<OverpassGeometryEntity> toSave = new ArrayList<>();
    List<OverpassGeometryEntity> toDelete = new ArrayList<>();
    for (int i = 0; i < locations.size(); i += LOOKUP_CHUNK_SIZE) {
      List<OverpassLocationEntity> chunk = locations.subList(i, Math.min(i + LOOKUP_CHUNK_SIZE, locations.size()));
      Map<Long, OverpassGeometryEntity> existing = overpassGeometryRepository
        .findAllById(chunk.stream().map(OverpassLocationEntity::getId).toList())
        .stream()
        .collect(Collectors.toMap(OverpassGeometryEntity::getGeometryId, Function.identity()));

      for (OverpassLocationEntity location : chunk) {
        Geometry geometry = geometries.get(location);
        OverpassGeometryEntity entity = existing.get(location.getId());
        if (geometry == null) {
          // Geometry could not be built this time; don't keep a stale one
          if (entity != null) toDelete.add(entity);
          continue;
        }
        if (entity == null) entity = new OverpassGeometryEntity(location);
        entity.setGeometry(geometry);
        toSave.add(entity);
      }
    }
    overpassGeometryRepository.deleteAll(toDelete);
    overpassGeometryRepository.saveAll(toSave);
  }

  /** True if the element has a usable position (node lat/lon, or center for ways/relations). */
  private static boolean hasPosition(OverpassResponse.Element e) {
    boolean hasPosition = (e.lat() != null && e.lon() != null) || e.center() != null;
    return hasPosition && e.type() != null;
  }

  /** Copies an element's position and tags onto the place it was imported as. */
  private static void update(OverpassLocationEntity place, OverpassResponse.Element e, String generation) {
    boolean isNode = e.lat() != null && e.lon() != null;
    double latitude = isNode ? e.lat() : e.center().lat();
    double longitude = isNode ? e.lon() : e.center().lon();
    place.update(latitude, longitude, e.tags() == null ? Map.of() : e.tags(), generation);
  }
}
