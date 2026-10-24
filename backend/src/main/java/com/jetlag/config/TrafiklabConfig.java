package com.jetlag.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(TrafiklabProperties.class)
public class TrafiklabConfig {

  /** Client for Samtrafiken's open data host, which serves both the static and realtime GTFS feeds. */
  @Bean
  RestClient trafiklabRestClient() {
    return RestClient.builder()
      .baseUrl("https://opendata.samtrafiken.se")
      .defaultHeader(HttpHeaders.USER_AGENT, "jetlag/1.0 (fusion1013@gmail.com)")
      .build();
  }
}
