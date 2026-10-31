package com.jetlag.places.model;

enum OutMode {
  CENTER("out center tags;"),
  // Full body, not "tags": that leaves out a relation's members, and with them every way its shape is built from
  GEOM("out geom;");

  private final String statement;
  OutMode(String statement) { this.statement = statement; }
  public String statement() { return statement; }
}
