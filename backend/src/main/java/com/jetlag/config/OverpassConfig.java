package com.jetlag.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

@Configuration
public class OverpassConfig {

  @Bean
  RestClient overpassRestClient(@Value("${overpass.base-url}") String baseUrl) {
    return RestClient.builder()
      .baseUrl(baseUrl)
      .defaultHeader(HttpHeaders.USER_AGENT, "jetlag/1.0 (fusion1013@gmail.com)")
      .build();
  }
}
