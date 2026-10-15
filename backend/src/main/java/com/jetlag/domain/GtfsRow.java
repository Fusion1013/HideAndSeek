package com.jetlag.domain;

import java.util.Map;

public record GtfsRow(Map<String, String> values) {

  public GtfsRow {
    values = Map.copyOf(values);
  }

  public String get(String column) {
    return values.get(column);
  }

  public String id() {
    return values.get("id");
  }
}
