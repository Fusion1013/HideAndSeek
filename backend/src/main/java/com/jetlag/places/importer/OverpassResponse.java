package com.jetlag.places.importer;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
record OverpassResponse(List<Element> elements) {

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Element(String type, long id, Double lat, Double lon, Center center, Map<String, String> tags, List<LatLon> geometry, List<Member> members) {
    public Element withCenter(Center c) {
      return new Element(type, id, null, null, c, tags, geometry, members);
    }
  }

  public record Center(double lat, double lon) {}

  public record LatLon(double lat, double lon) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Member(String type, long ref, String role, List<LatLon> geometry) {}

}
