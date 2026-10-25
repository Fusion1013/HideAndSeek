package com.jetlag.game.template;

import com.jetlag.game.RouteSnapshot;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Polygon;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** The reusable setup of a game: where it is played and which routes count. Created in Create mode. */
@Entity
@Table(name = "game_template")
public class GameTemplateEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, columnDefinition = "geometry(Polygon,4326)")
  private Polygon boundary;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private Map<String, Object> settings = new HashMap<>();

  /** SHA-256 of the token that may edit the template; the token itself is only ever sent to its creator. */
  @Column(name = "owner_token_hash", nullable = false)
  private byte[] ownerTokenHash;

  @ElementCollection
  @CollectionTable(name = "game_template_route", joinColumns = @JoinColumn(name = "template_id"))
  private Set<RouteSnapshot> routes = new HashSet<>();

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected GameTemplateEntity() {
  }

  public GameTemplateEntity(String name, Polygon boundary, byte[] ownerTokenHash) {
    this.name = name;
    this.boundary = boundary;
    this.ownerTokenHash = ownerTokenHash;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Polygon getBoundary() {
    return boundary;
  }

  public void setBoundary(Polygon boundary) {
    this.boundary = boundary;
  }

  public Map<String, Object> getSettings() {
    return settings;
  }

  public void setSettings(Map<String, Object> settings) {
    this.settings = settings;
  }

  public byte[] getOwnerTokenHash() {
    return ownerTokenHash;
  }

  public Set<RouteSnapshot> getRoutes() {
    return routes;
  }

  public void setRoutes(Set<RouteSnapshot> routes) {
    this.routes = routes;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
