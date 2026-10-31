package com.jetlag.game.question;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface GameQuestionPhotoRepository extends JpaRepository<GameQuestionPhotoEntity, UUID> {
}
