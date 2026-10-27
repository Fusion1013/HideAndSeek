package com.jetlag.game.session;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** Someone who joined a game with its invite code. There are no accounts: the player's token is who they are. */
@Entity
@Table(name = "game_player")
public class GamePlayerEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "game_id", nullable = false)
  private GameEntity game;

  @Column(name = "display_name", nullable = false)
  private String displayName;

  /** Null until roles are handed out in the lobby. */
  @Enumerated(EnumType.STRING)
  private PlayerRole role;

  @Column(name = "is_host", nullable = false)
  private boolean host;

  /** SHA-256 of the player's token; the token itself is only ever sent to the player. */
  @Column(name = "token_hash", nullable = false, unique = true)
  private byte[] tokenHash;

  @CreationTimestamp
  @Column(name = "joined_at", nullable = false, updatable = false)
  private Instant joinedAt;

  @Column(name = "last_seen_at")
  private Instant lastSeenAt;

  /** Where the player last reported being. Only a seeker's is shown while the game runs, and only to hiders. */
  @Column(name = "last_location", columnDefinition = "geometry(Point,4326)")
  private Point lastLocation;

  /** Radius of the 95% confidence circle around the last location, in metres. */
  @Column(name = "last_location_accuracy_m")
  private Float lastLocationAccuracyMeters;

  @Column(name = "last_location_at")
  private Instant lastLocationAt;

  protected GamePlayerEntity() {
  }

  public GamePlayerEntity(GameEntity game, String displayName, boolean host, byte[] tokenHash) {
    this.game = game;
    this.displayName = displayName;
    this.host = host;
    this.tokenHash = tokenHash;
  }

  public UUID getId() {
    return id;
  }

  public GameEntity getGame() {
    return game;
  }

  public String getDisplayName() {
    return displayName;
  }

  public PlayerRole getRole() {
    return role;
  }

  public void setRole(PlayerRole role) {
    this.role = role;
  }

  public boolean isHost() {
    return host;
  }

  public byte[] getTokenHash() {
    return tokenHash;
  }

  public Instant getJoinedAt() {
    return joinedAt;
  }

  public Instant getLastSeenAt() {
    return lastSeenAt;
  }

  public void setLastSeenAt(Instant lastSeenAt) {
    this.lastSeenAt = lastSeenAt;
  }

  public Point getLastLocation() {
    return lastLocation;
  }

  public Float getLastLocationAccuracyMeters() {
    return lastLocationAccuracyMeters;
  }

  public Instant getLastLocationAt() {
    return lastLocationAt;
  }

  public void setLastLocation(Point location, Float accuracyMeters, Instant at) {
    this.lastLocation = location;
    this.lastLocationAccuracyMeters = accuracyMeters;
    this.lastLocationAt = at;
  }
}
