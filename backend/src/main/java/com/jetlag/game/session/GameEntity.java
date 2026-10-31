package com.jetlag.game.session;

import com.jetlag.game.GameSettings;
import com.jetlag.game.RouteSnapshot;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Polygon;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * One game, played from a template. The boundary, settings and routes are copies, so editing the template
 * afterwards does not change a game in progress.
 */
@Entity
@Table(name = "game")
public class GameEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  /** The template it was created from; null once that template is deleted. */
  @Column(name = "template_id")
  private UUID templateId;

  @Column(name = "invite_code", nullable = false, length = 8)
  private String inviteCode;

  /** The template's name when the game was created. */
  @Column(nullable = false)
  private String name;

  /** How long the hiders have before the seekers set off. */
  @Column(name = "hiding_minutes", nullable = false)
  private int hidingMinutes;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private GameStatus status = GameStatus.LOBBY;

  @Column(nullable = false, columnDefinition = "geometry(Polygon,4326)")
  private Polygon boundary;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private GameSettings settings = GameSettings.DEFAULTS;

  @ElementCollection
  @CollectionTable(name = "game_route", joinColumns = @JoinColumn(name = "game_id"))
  private Set<RouteSnapshot> routes = new HashSet<>();

  @Column(name = "hiding_started_at")
  private Instant hidingStartedAt;

  @Column(name = "hiding_ends_at")
  private Instant hidingEndsAt;

  @Column(name = "seeking_started_at")
  private Instant seekingStartedAt;

  @Column(name = "finished_at")
  private Instant finishedAt;

  /** How it ended; null until it is finished. */
  @Enumerated(EnumType.STRING)
  private GameOutcome outcome;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  /** Two players changing the game's phase at the same time: the second one fails instead of overwriting. */
  @Version
  private long version;

  protected GameEntity() {
  }

  public GameEntity(UUID templateId, String inviteCode, String name, int hidingMinutes, Polygon boundary,
                    GameSettings settings, Set<RouteSnapshot> routes) {
    this.templateId = templateId;
    this.inviteCode = inviteCode;
    this.name = name;
    this.hidingMinutes = hidingMinutes;
    this.boundary = boundary;
    this.settings = settings;
    this.routes = new HashSet<>(routes);
  }

  public UUID getId() {
    return id;
  }

  public UUID getTemplateId() {
    return templateId;
  }

  public String getInviteCode() {
    return inviteCode;
  }

  public String getName() {
    return name;
  }

  public int getHidingMinutes() {
    return hidingMinutes;
  }

  public Instant getHidingEndsAt() {
    return hidingEndsAt;
  }

  /** Lobby to hiding: the hiders' time starts now. */
  public void startHiding(Instant now) {
    if (status != GameStatus.LOBBY) throw new IllegalStateException("Only a game in the lobby can start");
    status = GameStatus.HIDING;
    hidingStartedAt = now;
    hidingEndsAt = now.plus(Duration.ofMinutes(hidingMinutes));
  }

  /** Ends the game, from any phase. */
  public void finish(Instant now, GameOutcome outcome) {
    if (status == GameStatus.FINISHED) return;
    status = GameStatus.FINISHED;
    finishedAt = now;
    this.outcome = outcome;
  }

  public GameOutcome getOutcome() {
    return outcome;
  }

  public GameStatus getStatus() {
    return status;
  }

  public Polygon getBoundary() {
    return boundary;
  }

  public GameSettings getSettings() {
    return settings;
  }

  public Set<RouteSnapshot> getRoutes() {
    return routes;
  }

  public Instant getHidingStartedAt() {
    return hidingStartedAt;
  }

  public Instant getSeekingStartedAt() {
    return seekingStartedAt;
  }

  public Instant getFinishedAt() {
    return finishedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public long getVersion() {
    return version;
  }
}
