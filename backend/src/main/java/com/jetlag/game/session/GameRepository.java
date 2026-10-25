package com.jetlag.game.session;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface GameRepository extends JpaRepository<GameEntity, UUID> {

  /** Invite codes are only unique among games that are not finished. */
  Optional<GameEntity> findByInviteCodeAndStatusNot(String inviteCode, GameStatus status);

  boolean existsByInviteCodeAndStatusNot(String inviteCode, GameStatus status);

  /**
   * The game, locked until the transaction ends. Every change to a game takes this lock first, so changes to one
   * game happen one after another and their events are numbered in the order they were committed.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT game FROM GameEntity game WHERE game.id = :id")
  Optional<GameEntity> findForUpdate(@Param("id") UUID id);
}
