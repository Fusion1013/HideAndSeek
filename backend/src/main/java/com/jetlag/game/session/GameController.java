package com.jetlag.game.session;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.Parameter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

/**
 * Games: created from a template, joined with an invite code. Creating or joining returns a player token; every
 * other request about the game needs it, and only works on the game it belongs to.
 */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api/games", produces = MediaType.APPLICATION_JSON_VALUE)
public class GameController {

  private final GameService gameService;
  private final GameStreamService streamService;

  public GameController(GameService gameService, GameStreamService streamService) {
    this.gameService = gameService;
    this.streamService = streamService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @Operation(
    operationId = "createGame",
    summary = "Create a game from a template",
    description = "The creator becomes the host. Returns their player token; it is not sent again.",
    responses = {
      @ApiResponse(responseCode = "201", description = "The new game, and the host's player ID and token"),
      @ApiResponse(responseCode = "400", description = "Missing name or hiding time out of range"),
      @ApiResponse(responseCode = "404", description = "No such template")
    }
  )
  public JoinedGameDTO createGame(@RequestBody GameRequests.CreateGameRequest request) {
    return gameService.create(request);
  }

  @PostMapping("/join")
  @Operation(
    operationId = "joinGame",
    summary = "Join a game with its invite code",
    description = "Only while the game is in its lobby. Returns the player's token; it is not sent again.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game, and the new player's ID and token"),
      @ApiResponse(responseCode = "400", description = "Missing name"),
      @ApiResponse(responseCode = "404", description = "No game with this invite code"),
      @ApiResponse(responseCode = "409", description = "Already started, full, or the name is taken")
    }
  )
  public JoinedGameDTO joinGame(@RequestBody GameRequests.JoinGameRequest request) {
    return gameService.join(request);
  }

  @GetMapping("/{gameId}")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "getGame",
    summary = "Get the game as this player sees it",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game"),
      @ApiResponse(responseCode = "401", description = "No valid player token"),
      @ApiResponse(responseCode = "403", description = "The token belongs to another game")
    }
  )
  public PlayerGameDTO getGame(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    return gameService.get(player);
  }

  @GetMapping(value = "/{gameId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "streamGameEvents",
    summary = "Follow the game as it happens (server-sent events)",
    description = """
      Starts with a "snapshot" event (a PlayerGameDTO). Then a "game" event (a GameDTO) for every change, and a       "heartbeat" ({"serverTime": ...}) every 20 seconds. Each event has an ID: a client that reconnects with the       last one in Last-Event-ID gets the events it missed (ending with "caught-up") instead of a snapshot. Players       only receive the events their role may see. Needs the player token in the Authorization header, so it is       read with fetch rather than EventSource.""",
    responses = {
      @ApiResponse(responseCode = "200", description = "The event stream",
        content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE, schema = @Schema(type = "string"))),
      @ApiResponse(responseCode = "401", description = "No valid player token"),
      @ApiResponse(responseCode = "403", description = "The token belongs to another game")
    }
  )
  public SseEmitter streamGameEvents(
    @PathVariable UUID gameId,
    @CurrentPlayer GamePlayerEntity player,
    @Parameter(hidden = true) @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
    HttpServletResponse response) {
    // Tells nginx not to buffer the stream; it would otherwise hold events back
    response.setHeader("X-Accel-Buffering", "no");
    response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache");
    return streamService.open(player, parseEventId(lastEventId));
  }

  @PutMapping("/{gameId}/players/{playerId}/role")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "setPlayerRole",
    summary = "Give a player a role, or take it away",
    description = "Host only, in the lobby.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game with the new role"),
      @ApiResponse(responseCode = "403", description = "Not the host"),
      @ApiResponse(responseCode = "404", description = "No such player in this game"),
      @ApiResponse(responseCode = "409", description = "The game has started")
    }
  )
  public PlayerGameDTO setPlayerRole(@PathVariable UUID gameId, @PathVariable UUID playerId,
                               @CurrentPlayer GamePlayerEntity host, @RequestBody GameRequests.RoleRequest request) {
    return gameService.setRole(host, playerId, request.role());
  }

  @PostMapping("/{gameId}/start")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "startGame",
    summary = "Start the hiding time",
    description = "Host only. Every player needs a role, with at least one hider and one seeker.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game, now hiding"),
      @ApiResponse(responseCode = "403", description = "Not the host"),
      @ApiResponse(responseCode = "409", description = "Already started, or the roles are not ready")
    }
  )
  public PlayerGameDTO startGame(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity host) {
    return gameService.start(host);
  }

  @PostMapping("/{gameId}/end")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "endGame",
    summary = "End the game",
    description = "Host only, in any phase.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game, now finished"),
      @ApiResponse(responseCode = "403", description = "Not the host")
    }
  )
  public PlayerGameDTO endGame(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity host) {
    return gameService.end(host);
  }

  private static Long parseEventId(String lastEventId) {
    if (lastEventId == null || lastEventId.isBlank()) return null;
    try {
      return Long.parseLong(lastEventId.trim());
    } catch (NumberFormatException e) {
      return null;
    }
  }
}
