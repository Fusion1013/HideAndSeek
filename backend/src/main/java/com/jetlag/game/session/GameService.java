package com.jetlag.game.session;

import com.jetlag.game.RouteSnapshot;
import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.events.EventAudience;
import com.jetlag.game.events.GameEventLog;
import com.jetlag.game.template.GameTemplateEntity;
import com.jetlag.game.template.GameTemplateRepository;
import jakarta.persistence.EntityManager;
import org.locationtech.jts.geom.Polygon;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * A game from creation to its end: created from a template by its host, joined with the invite code while in the
 * lobby, where the host hands out roles and starts it. The hiders then have the game's hiding time before the
 * seekers set off. Every change locks the game first and records a {@value #GAME_EVENT} event with the new state,
 * which reaches the players' event streams once the change commits.
 */
@Service
public class GameService {

  /** The event carrying a game's new state, as a {@link GameDTO}. */
  public static final String GAME_EVENT = "game";

  static final int MAX_NAME_LENGTH = 30;
  static final int MAX_PLAYERS = 30;
  static final int MIN_HIDING_MINUTES = 1;
  static final int MAX_HIDING_MINUTES = 300;
  static final int DEFAULT_HIDING_MINUTES = 30;
  /** A clash with a running game's code is very unlikely; several in a row means something else is wrong. */
  private static final int INVITE_CODE_ATTEMPTS = 10;

  private final GameRepository gameRepository;
  private final GamePlayerRepository playerRepository;
  private final GameTemplateRepository templateRepository;
  private final GameStations stations;
  private final GamePhases phases;
  private final GameEventLog eventLog;
  private final PlayerViews playerViews;
  private final EntityManager entityManager;
  private final Clock clock;

  public GameService(GameRepository gameRepository, GamePlayerRepository playerRepository,
                     GameTemplateRepository templateRepository, GameStations stations, GamePhases phases,
                     GameEventLog eventLog, PlayerViews playerViews, EntityManager entityManager, Clock clock) {
    this.gameRepository = gameRepository;
    this.playerRepository = playerRepository;
    this.templateRepository = templateRepository;
    this.stations = stations;
    this.phases = phases;
    this.eventLog = eventLog;
    this.playerViews = playerViews;
    this.entityManager = entityManager;
    this.clock = clock;
  }

  /** A new game in the lobby, with the creator as its host. Anyone who can open the template may create one. */
  @Transactional
  public JoinedGameDTO create(GameRequests.CreateGameRequest request) {
    String displayName = validName(request.displayName());
    int hidingMinutes = request.hidingMinutes() == null ? DEFAULT_HIDING_MINUTES : request.hidingMinutes();
    if (hidingMinutes < MIN_HIDING_MINUTES || hidingMinutes > MAX_HIDING_MINUTES) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "The hiding time must be " + MIN_HIDING_MINUTES + " to " + MAX_HIDING_MINUTES + " minutes");
    }
    GameTemplateEntity template = request.templateId() == null ? null
      : templateRepository.findById(request.templateId()).orElse(null);
    if (template == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found: " + request.templateId());
    }

    GameEntity game = gameRepository.saveAndFlush(new GameEntity(template.getId(), unusedInviteCode(),
      template.getName(), hidingMinutes, (Polygon) template.getBoundary().copy(), template.getSettings(),
      template.getRoutes()));
    stations.snapshot(game.getId(), template.getRoutes().stream().map(RouteSnapshot::routeId).toList());
    JoinedGameDTO host = addPlayer(game, displayName, true);
    recordState(game);
    return host;
  }

  /** Joins the game with this invite code, which must still be in its lobby. */
  @Transactional
  public JoinedGameDTO join(GameRequests.JoinGameRequest request) {
    String displayName = validName(request.displayName());
    UUID gameId = gameRepository
      .findByInviteCodeAndStatusNot(InviteCodes.normalize(request.inviteCode()), GameStatus.FINISHED)
      .map(GameEntity::getId)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "There is no game with this invite code"));
    GameEntity game = lock(gameId);
    if (game.getStatus() != GameStatus.LOBBY) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This game has already started");
    }

    List<GamePlayerEntity> players = playerRepository.findByGameIdOrderByJoinedAt(game.getId());
    if (players.size() >= MAX_PLAYERS) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This game is full");
    }
    String folded = displayName.toLowerCase(Locale.ROOT);
    if (players.stream().anyMatch(player -> player.getDisplayName().toLowerCase(Locale.ROOT).equals(folded))) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone in this game already has that name");
    }
    JoinedGameDTO joined = addPlayer(game, displayName, false);
    recordState(game);
    return joined;
  }

  /** The game as the player sees it, moved on to seeking first if the hiding time is up. */
  @Transactional
  public PlayerGameDTO get(GamePlayerEntity player) {
    Instant now = clock.instant();
    advancePhases(now);
    GameEntity game = gameRepository.findById(player.getGame().getId())
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
    return playerViews.of(state(game), player.getId(), now);
  }

  /**
   * Moves every game whose hiding time is up on to seeking, and tells its players. Run on a schedule, as nothing
   * else may happen in a game at that moment, and before reading a game, so the answer is never behind.
   */
  @Transactional
  public void advancePhases() {
    advancePhases(clock.instant());
  }

  /**
   * Ends the games nobody has played for the given time, and tells anyone still following them. Their invite
   * codes are then free again.
   */
  @Transactional
  public int finishIdleGames(Duration idleFor) {
    Instant now = clock.instant();
    int finished = 0;
    for (UUID gameId : phases.idleSince(now.minus(idleFor))) {
      GameEntity game = lock(gameId);
      if (game.getStatus() == GameStatus.FINISHED) continue;
      game.finish(now);
      gameRepository.saveAndFlush(game);
      recordState(game);
      finished++;
    }
    return finished;
  }

  /** Deletes the games that finished longer ago than the given time, with all their data. */
  @Transactional
  public int deleteFinishedGames(Duration keepFor) {
    return phases.deleteFinishedBefore(clock.instant().minus(keepFor));
  }

  /** The host hands a role to a player in the lobby, or takes it away. */
  @Transactional
  public PlayerGameDTO setRole(GamePlayerEntity host, UUID playerId, PlayerRole role) {
    requireHost(host);
    GameEntity game = lock(host.getGame().getId());
    requireLobby(game, "Roles can only change in the lobby");
    GamePlayerEntity player = playerRepository.findById(playerId)
      .filter(candidate -> candidate.getGame().getId().equals(game.getId()))
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such player in this game"));
    player.setRole(role);
    playerRepository.flush();
    return answer(game, host);
  }

  /** The host starts the hiding time, once everyone has a role and both sides have someone. */
  @Transactional
  public PlayerGameDTO start(GamePlayerEntity host) {
    requireHost(host);
    GameEntity game = lock(host.getGame().getId());
    requireLobby(game, "The game has already started");

    List<GamePlayerEntity> players = playerRepository.findByGameIdOrderByJoinedAt(game.getId());
    if (players.stream().anyMatch(player -> player.getRole() == null)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Every player needs a role first");
    }
    if (players.stream().noneMatch(player -> player.getRole() == PlayerRole.HIDER)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The game needs at least one hider");
    }
    if (players.stream().noneMatch(player -> player.getRole() == PlayerRole.SEEKER)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The game needs at least one seeker");
    }

    game.startHiding(clock.instant());
    gameRepository.saveAndFlush(game);
    return answer(game, host);
  }

  /** The host ends the game, whatever its phase. Its invite code can then be used by a new game. */
  @Transactional
  public PlayerGameDTO end(GamePlayerEntity host) {
    requireHost(host);
    GameEntity game = lock(host.getGame().getId());
    if (game.getStatus() == GameStatus.FINISHED) return playerViews.of(state(game), host.getId(), clock.instant());
    game.finish(clock.instant());
    gameRepository.saveAndFlush(game);
    return answer(game, host);
  }

  private void advancePhases(Instant now) {
    for (UUID gameId : phases.startSeekingWhereHidingIsOver(now)) {
      gameRepository.findById(gameId).ifPresent(game -> {
        // Changed by SQL, behind the back of a copy this transaction may have read before
        entityManager.refresh(game);
        recordState(game);
      });
    }
  }

  /** Records the game's new state for its players, and answers the player who changed it with the same state. */
  private PlayerGameDTO answer(GameEntity game, GamePlayerEntity player) {
    return playerViews.of(recordState(game), player.getId(), clock.instant());
  }

  private GameDTO recordState(GameEntity game) {
    GameDTO state = state(game);
    eventLog.record(game.getId(), GAME_EVENT, EventAudience.ALL, state);
    return state;
  }

  private GameDTO state(GameEntity game) {
    return GameDTO.from(game, playerRepository.findByGameIdOrderByJoinedAt(game.getId()), stations.count(game.getId()));
  }

  private JoinedGameDTO addPlayer(GameEntity game, String displayName, boolean host) {
    AccessTokens.IssuedToken token = AccessTokens.issue();
    GamePlayerEntity player = playerRepository.saveAndFlush(new GamePlayerEntity(game, displayName, host, token.hash()));
    return new JoinedGameDTO(game.getId(), player.getId(), token.token());
  }

  private String unusedInviteCode() {
    for (int attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      String code = InviteCodes.generate();
      if (!gameRepository.existsByInviteCodeAndStatusNot(code, GameStatus.FINISHED)) return code;
    }
    throw new IllegalStateException("No unused invite code after " + INVITE_CODE_ATTEMPTS + " attempts");
  }

  private GameEntity lock(UUID gameId) {
    return gameRepository.findForUpdate(gameId)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
  }

  private static void requireHost(GamePlayerEntity player) {
    if (!player.isHost()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the host can do this");
  }

  private static void requireLobby(GameEntity game, String reason) {
    if (game.getStatus() != GameStatus.LOBBY) throw new ResponseStatusException(HttpStatus.CONFLICT, reason);
  }

  private static String validName(String name) {
    String trimmed = name == null ? "" : name.strip();
    if (trimmed.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a name");
    if (trimmed.length() > MAX_NAME_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Names can be at most " + MAX_NAME_LENGTH + " characters");
    }
    return trimmed;
  }
}
