package com.jetlag.places.importer;

import com.jetlag.places.model.OverpassLocationCategory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/** Queries the Overpass API for every place of a category in Sweden. */
@Component
class OverpassClient {

  private final RestClient client;

  OverpassClient(@Qualifier("overpassRestClient") RestClient overpassRestClient) {
    this.client = overpassRestClient;
  }

  OverpassResponse fetch(OverpassLocationCategory locationCategory) {
    String query = """
      [out:json][timeout:180];
      area["ISO3166-1"="SE"][admin_level=2]->.a;
      %s
      %s
      """.formatted(locationCategory.overpassStatement("a"), locationCategory.outStatement());

    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("data", query);

    return client.post()
      .contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .body(form)
      .retrieve()
      .body(OverpassResponse.class);
  }
}
