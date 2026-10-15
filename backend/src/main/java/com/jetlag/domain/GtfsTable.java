package com.jetlag.domain;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public class GtfsTable {

  private final String name;
  private final List<GtfsRow> rows;
  private final Map<String, GtfsRow> byId;
  private final String idColumn;

  public GtfsTable(
    String name,
    String idColumn,
    List<GtfsRow> rows) {

    this.name = name;
    this.idColumn = idColumn;
    this.rows = List.copyOf(rows);

    if (idColumn == null) {
      this.byId = Map.of();
    } else {
      this.byId = rows.stream()
        .filter(row -> row.get(idColumn) != null)
        .collect(java.util.stream.Collectors.toUnmodifiableMap(
          row -> row.get(idColumn),
          row -> row,
          (first, second) -> first
        ));
    }
  }

  public String getName() {
    return name;
  }

  public List<GtfsRow> getRows() {
    return rows;
  }

  public Optional<GtfsRow> findById(String id) {
    return Optional.ofNullable(byId.get(id));
  }

  public String getIdColumn() {
    return idColumn;
  }

  public int size() {
    return rows.size();
  }
}
