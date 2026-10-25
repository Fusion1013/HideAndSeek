package com.jetlag.game.session;

import com.jetlag.game.question.QuestionDTO;
import com.jetlag.game.question.QuestionService;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Builds the answer for one player: the shared state plus what their role may see. The one place that decides
 * who sees the hiding station and the seekers' locations; anything that answers a player goes through here.
 */
@Component
public class PlayerViews {

  private final GamePlayerRepository playerRepository;
  private final HidingSpots hidingSpots;
  private final QuestionService questionService;

  public PlayerViews(GamePlayerRepository playerRepository, HidingSpots hidingSpots, QuestionService questionService) {
    this.playerRepository = playerRepository;
    this.hidingSpots = hidingSpots;
    this.questionService = questionService;
  }

  /** {@code state}: the game as everyone sees it; the player's role is read again, as it may have just changed. */
  public PlayerGameDTO of(GameDTO state, UUID playerId, Instant now) {
    List<GamePlayerEntity> players = playerRepository.findByGameIdOrderByJoinedAt(state.id());
    // No role yet is null, which Optional cannot hold: find the player, then read the role
    PlayerRole role = players.stream().filter(player -> player.getId().equals(playerId))
      .findFirst().map(GamePlayerEntity::getRole).orElse(null);
    // Every player sees the questions and answers
    List<QuestionDTO> questions = questionService.list(state.id());
    if (role != PlayerRole.HIDER) return new PlayerGameDTO(state, playerId, now, null, List.of(), questions);

    List<SeekerLocationDTO> seekers = players.stream()
      .filter(player -> player.getRole() == PlayerRole.SEEKER && player.getLastLocation() != null)
      .map(SeekerLocationDTO::from)
      .toList();
    return new PlayerGameDTO(state, playerId, now, hidingSpots.find(state.id()).orElse(null), seekers, questions);
  }
}
