package com.jetlag.game.session;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GamePlayerRepository extends JpaRepository<GamePlayerEntity, UUID> {

  /** The player a request's token belongs to, with their game, which almost every caller needs next. */
  @EntityGraph(attributePaths = "game")
  Optional<GamePlayerEntity> findByTokenHash(byte[] tokenHash);

  List<GamePlayerEntity> findByGameIdOrderByJoinedAt(UUID gameId);
}
