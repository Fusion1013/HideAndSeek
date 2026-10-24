package com.jetlag.places.model;

enum OutMode {
  CENTER("out center tags;"),
  GEOM("out geom tags;");

  private final String statement;
  OutMode(String statement) { this.statement = statement; }
  public String statement() { return statement; }
}
