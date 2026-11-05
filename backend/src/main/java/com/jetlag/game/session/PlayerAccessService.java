package com.jetlag.game.session;

import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.auth.InvalidTokenException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Getting a player's place in a game back when their browser has lost its token: from the copy in the browser's
 * cookie, or with a one-time code the host makes for them, which works on any browser or device. Either way the
 * player gets a new token, and the old one stops working.
 */
@Service
public class PlayerAccessService {

  /** Long enough to send the link and open it; short enough that an old message is no way in. */
  static final Duration REJOIN_CODE_TTL = Duration.ofMinutes(30);

  private final GameRepository gameRepository;
  private final GamePlayerRepository playerRepository;
  private final Clock clock;

  public PlayerAccessService(GameRepository gameRepository, GamePlayerRepository playerRepository, Clock clock) {
    this.gameRepository = gameRepository;
    this.playerRepository = playerRepository;
    this.clock = clock;
  }

  /** The player whose token the browser's cookie holds, with a new token. 401 without one for this game. */
  @Transactional
  public JoinedGameDTO restore(UUID gameId, String cookieToken) {
    lock(gameId);
    GamePlayerEntity player = playerRepository.findByTokenHash(AccessTokens.hash(cookieToken))
      .filter(candidate -> candidate.getGame().getId().equals(gameId))
      .orElseThrow(InvalidTokenException::new);
    return newToken(player);
  }

  /**
   * The host makes a one-time code for a player (themself included) to rejoin with. A new code replaces the
   * player's earlier one.
   */
  @Transactional
  public RejoinCodeDTO createRejoinCode(GamePlayerEntity host, UUID playerId) {
    if (!host.isHost()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the host can do this");
    UUID gameId = host.getGame().getId();
    lock(gameId);
    GamePlayerEntity player = playerRepository.findById(playerId)
      .filter(candidate -> candidate.getGame().getId().equals(gameId))
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such player in this game"));
    AccessTokens.IssuedToken code = AccessTokens.issue();
    Instant expiresAt = clock.instant().plus(REJOIN_CODE_TTL);
    player.setRejoinCode(code.hash(), expiresAt);
    playerRepository.flush();
    return new RejoinCodeDTO(player.getId(), code.token(), expiresAt);
  }

  /** Becomes the player the host made this code for, once; whoever held their place before loses it. */
  @Transactional
  public JoinedGameDTO rejoin(UUID gameId, String code) {
    lock(gameId);
    GamePlayerEntity player = Optional.ofNullable(code).map(String::strip).filter(typed -> !typed.isEmpty())
      .flatMap(typed -> playerRepository.findByRejoinCodeHash(AccessTokens.hash(typed)))
      .filter(candidate -> candidate.getGame().getId().equals(gameId))
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
        "This rejoin link is not valid. It may have been used already; ask the host for a new one."));
    if (!clock.instant().isBefore(player.getRejoinCodeExpiresAt())) {
      throw new ResponseStatusException(HttpStatus.GONE, "This rejoin link has expired. Ask the host for a new one.");
    }
    player.clearRejoinCode();
    return newToken(player);
  }

  private JoinedGameDTO newToken(GamePlayerEntity player) {
    AccessTokens.IssuedToken token = AccessTokens.issue();
    player.replaceToken(token.hash());
    playerRepository.flush();
    return new JoinedGameDTO(player.getGame().getId(), player.getId(), token.token());
  }

  /** Changes to a game's players happen one at a time, as every other change to the game does. */
  private void lock(UUID gameId) {
    gameRepository.findForUpdate(gameId)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
  }
}
