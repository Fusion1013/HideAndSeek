package com.jetlag.service;

import com.jetlag.domain.OverpassLocation;
import com.jetlag.domain.OverpassResponse;
import com.jetlag.repository.OverpassLocationRepository;
import com.jetlag.util.Bounds;
import com.jetlag.util.OsmType;
import com.jetlag.util.OverpassLocationCategory;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class OverpassService {

  private final RestClient client;
  private final OverpassLocationRepository overpassLocationRepository;

  public OverpassService(RestClient overpassRestClient, OverpassLocationRepository overpassLocationRepository) {
    this.client = overpassRestClient;
    this.overpassLocationRepository = overpassLocationRepository;
  }

  @Transactional
  public Page<OverpassLocation> search(OverpassLocationCategory category, Bounds bounds, Pageable pageable) {
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

  @Transactional
  public Optional<OverpassLocation> findById(Long id) {
    return overpassLocationRepository.findById(id);
  }

  @Transactional
  public int updateOverpassData(String generation, OverpassLocationCategory category) {
    int nImported = 0;

    nImported += update(category, generation);

    int nDeleted = overpassLocationRepository.deleteNotInGeneration(generation, category);

    return nImported;
  }

  @Transactional
  private int update(OverpassLocationCategory category, String generation) {
    OverpassResponse response = find(category);
    saveAll(response, generation);
    return response.elements().size();
  }

  @Transactional
  private List<OverpassLocation> saveAll(OverpassResponse response, String generation) {
    if (response == null || response.elements() == null) return List.of();

    Map<OsmType, List<OverpassResponse.Element>> byType = response.elements().stream()
      .filter(OverpassLocation::isStorable)
      .collect(Collectors.groupingBy(e -> OsmType.fromOverpass(e.type())));

    List<OverpassLocation> toSave = new ArrayList<>();
    byType.forEach((type, elements) -> {
      Map<Long, OverpassLocation> existing = overpassLocationRepository
        .findByOsmTypeAndOsmIdIn(type, elements.stream().map(OverpassResponse.Element::id).toList())
        .stream()
        .collect(Collectors.toMap(OverpassLocation::getOsmId, Function.identity()));

      for (OverpassResponse.Element e : elements) {
        OverpassLocation place = existing.get(e.id());
        if (place == null) {
          place = OverpassLocation.fromElement(e, generation);
        } else {
          place.updateFrom(e, generation);
        }
        toSave.add(place);
      }
    });
    return overpassLocationRepository.saveAll(toSave);
  }

  private OverpassResponse find(OverpassLocationCategory locationCategory) {
    String query = """
      [out:json][timeout:180];
      area["ISO3166-1"="SE"][admin_level=2]->.a;
      %s
      %s;
      """.formatted(locationCategory.overpassStatement("a"), locationCategory.outStatement());

    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("data", query);

    return client.post()
      .contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .body(form)
      .retrieve()
      .body(OverpassResponse.class);
  }

  public OverpassResponse findCafes(double south, double west, double north, double east) {
    String query = """
      [out:json][timeout:25];
      (
        node["amenity"="cafe"](%f,%f,%f,%f);
        way["amenity"="cafe"](%f,%f,%f,%f);
      );
      out center tags;
      """.formatted(south, west, north, east, south, west, north, east);

    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("data", query);

    return client.post()
      .contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .body(form)
      .retrieve()
      .body(OverpassResponse.class);
  }
}
