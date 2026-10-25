package com.jetlag.game.question;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GameQuestionRepository extends JpaRepository<GameQuestionEntity, UUID> {

  List<GameQuestionEntity> findByGameIdOrderByAskedAt(UUID gameId);

  Optional<GameQuestionEntity> findByGameIdAndStatus(UUID gameId, GameQuestionEntity.Status status);

  List<GameQuestionEntity> findByStatusAndDeadlineAtLessThanEqual(GameQuestionEntity.Status status, Instant deadline);
}
