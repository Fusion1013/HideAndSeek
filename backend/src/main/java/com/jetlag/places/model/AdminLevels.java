package com.jetlag.places.model;

final class AdminLevels {
  private AdminLevels() {}

  // Sweden, adjust for other countries. Verify against the OSM wiki
  // (Tag:boundary=administrative, "admin_level" table).
  static final String DIVISION_1 = "4";  // län
  static final String DIVISION_2 = "7";  // kommun
  static final String DIVISION_4 = "9";  // finer subdivisions, patchy; verify
}
