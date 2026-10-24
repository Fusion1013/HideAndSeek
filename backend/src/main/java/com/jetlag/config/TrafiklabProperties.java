package com.jetlag.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Trafiklab (Samtrafiken open data) settings; see the {@code trafiklab} section of application.yml.
 *
 * @param staticApiKey     key for "GTFS Sweden 3 Static data", used by the GTFS import
 * @param realtimeApiKey   key for "GTFS Sweden 3 Realtime", used for vehicle positions
 * @param realtimeOperator operator whose realtime feed to read, e.g. "jlt"
 */
@ConfigurationProperties("trafiklab")
public record TrafiklabProperties(String staticApiKey, String realtimeApiKey, String realtimeOperator) {}
