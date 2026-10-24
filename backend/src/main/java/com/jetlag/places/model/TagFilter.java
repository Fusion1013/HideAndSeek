package com.jetlag.places.model;

import java.util.Map;

record TagFilter(String key, String value) {

  public static TagFilter of(String key, String value) { return new TagFilter(key, value); }
  public static TagFilter exists(String key) { return new TagFilter(key, null); }

  boolean matches(Map<String, String> tags) {
    String actual = tags.get(key);
    return value == null ? actual != null : value.equals(actual);
  }

  String toOverpass() {
    return value == null
      ? "[\"%s\"]".formatted(key)
      : "[\"%s\"=\"%s\"]".formatted(key, value);
  }
}
