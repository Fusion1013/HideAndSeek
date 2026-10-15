package com.jetlag.domain;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

public record GtfsDataset(
  Map<String, GtfsTable> tables,
  Instant downloadedAt
) {
  public GtfsDataset {
    tables = Map.copyOf(tables);
  }

  public Optional<GtfsTable> table(String name) {
    return Optional.ofNullable(tables.get(name));
  }

  public GtfsTable requireTable(String name) {
    return table(name).orElseThrow(() ->
      new IllegalArgumentException(
        "GTFS table not found: " + name
      )
    );
  }

  public Optional<GtfsRow> find(
    String tableName,
    String id) {

    return table(tableName)
      .flatMap(table -> table.findById(id));
  }
}
