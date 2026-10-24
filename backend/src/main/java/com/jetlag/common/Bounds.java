package com.jetlag.common;

public record Bounds(double south, double west, double north, double east) {

  public Bounds {
    if (south < -90 || north > 90 || west < -180 || east > 180) {
      throw new IllegalArgumentException("Coordinates out of range");
    }
    if (south > north) {
      throw new IllegalArgumentException("south must be <= north");
    }
    if (west > east) {
      throw new IllegalArgumentException("west must be <= east (bounds crossing the antimeridian are not supported)");
    }
  }
}
