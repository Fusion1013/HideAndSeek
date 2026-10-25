package com.jetlag.game.question;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/** A seeker's question, and the hiders' answer once given. */
@Entity
@Table(name = "game_question")
public class GameQuestionEntity {

  public enum Status {
    PENDING,
    ANSWERED,
    /** The hiders did not answer before the deadline. */
    EXPIRED
  }

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(name = "game_id", nullable = false)
  private UUID gameId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private QuestionType type;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private QuestionParams params;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Status status = Status.PENDING;

  @Column(name = "asked_by", nullable = false)
  private UUID askedBy;

  @Column(name = "asked_at", nullable = false)
  private Instant askedAt;

  @Column(name = "deadline_at", nullable = false)
  private Instant deadlineAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private QuestionAnswer answer;

  @Column(name = "answered_by")
  private UUID answeredBy;

  @Column(name = "answered_at")
  private Instant answeredAt;

  protected GameQuestionEntity() {
  }

  public GameQuestionEntity(UUID gameId, QuestionType type, QuestionParams params, UUID askedBy, Instant askedAt,
                            Instant deadlineAt) {
    this.gameId = gameId;
    this.type = type;
    this.params = params;
    this.askedBy = askedBy;
    this.askedAt = askedAt;
    this.deadlineAt = deadlineAt;
  }

  public void answer(QuestionAnswer answer, UUID hiderId, Instant at) {
    if (status != Status.PENDING) throw new IllegalStateException("Only a pending question can be answered");
    this.answer = answer;
    this.answeredBy = hiderId;
    this.answeredAt = at;
    this.status = Status.ANSWERED;
  }

  public void expire() {
    if (status == Status.PENDING) status = Status.EXPIRED;
  }

  public UUID getId() {
    return id;
  }

  public UUID getGameId() {
    return gameId;
  }

  public QuestionType getType() {
    return type;
  }

  public QuestionParams getParams() {
    return params;
  }

  public Status getStatus() {
    return status;
  }

  public UUID getAskedBy() {
    return askedBy;
  }

  public Instant getAskedAt() {
    return askedAt;
  }

  public Instant getDeadlineAt() {
    return deadlineAt;
  }

  public QuestionAnswer getAnswer() {
    return answer;
  }

  public UUID getAnsweredBy() {
    return answeredBy;
  }

  public Instant getAnsweredAt() {
    return answeredAt;
  }
}
