package com.jetlag.game.question;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** The picture that answers a photo question. */
@Entity
@Table(name = "game_question_photo")
public class GameQuestionPhotoEntity {

  @Id
  @Column(name = "question_id")
  private UUID questionId;

  @Column(nullable = false)
  private byte[] image;

  protected GameQuestionPhotoEntity() {
  }

  public GameQuestionPhotoEntity(UUID questionId, byte[] image) {
    this.questionId = questionId;
    this.image = image;
  }

  public UUID getQuestionId() {
    return questionId;
  }

  public byte[] getImage() {
    return image;
  }
}
