package com.jetlag.domain;

import java.io.Serializable;
import java.util.Objects;

public class ShapeId implements Serializable {

  private String shapeId;
  private Integer shapePtSequence;

  public ShapeId() {
  }

  public ShapeId(String shapeId, Integer shapePtSequence) {
    this.shapeId = shapeId;
    this.shapePtSequence = shapePtSequence;
  }

  public String getShapeId() {
    return shapeId;
  }

  public void setShapeId(String shapeId) {
    this.shapeId = shapeId;
  }

  public Integer getShapePtSequence() {
    return shapePtSequence;
  }

  public void setShapePtSequence(Integer shapePtSequence) {
    this.shapePtSequence = shapePtSequence;
  }

  @Override
  public boolean equals(Object object) {
    if (this == object) {
      return true;
    }

    if (!(object instanceof ShapeId other)) {
      return false;
    }

    return Objects.equals(shapeId, other.shapeId)
      && Objects.equals(shapePtSequence, other.shapePtSequence);
  }

  @Override
  public int hashCode() {
    return Objects.hash(shapeId, shapePtSequence);
  }
}
