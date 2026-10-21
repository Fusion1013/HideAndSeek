package com.jetlag.util;

import java.util.Locale;

public enum OsmType {
  NODE, WAY, RELATION;

  public static OsmType fromOverpass(String type) {
    return valueOf(type.toUpperCase(Locale.ROOT));
  }
}
