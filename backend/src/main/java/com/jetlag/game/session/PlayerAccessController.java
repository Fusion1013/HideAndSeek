package com.jetlag.game.session;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import com.jetlag.game.auth.InvalidTokenException;
import com.jetlag.game.auth.PlayerCookie;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Getting back into a game when the browser has lost the player's token. Both ways answer as joining does, with a
 * new token, and set the browser's cookie copy of it.
 */
@RestController
@RequestMapping(value = "/api/games/{gameId}", produces = MediaType.APPLICATION_JSON_VALUE)
public class PlayerAccessController {

  private final PlayerAccessService accessService;

  public PlayerAccessController(PlayerAccessService accessService) {
    this.accessService = accessService;
  }

  @PostMapping("/session")
  @Operation(
    operationId = "restorePlayer",
    summary = "Get this browser's place in the game back",
    description = """
      From the copy of the player's token the browser keeps as a cookie, for when the page has lost its own.       Returns a new token; the old one stops working.""",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game, and the player's ID and new token"),
      @ApiResponse(responseCode = "401", description = "This browser has no place in this game"),
      @ApiResponse(responseCode = "404", description = "No such game")
    }
  )
  public JoinedGameDTO restorePlayer(@PathVariable UUID gameId, HttpServletRequest request,
                                     HttpServletResponse response) {
    String cookieToken = PlayerCookie.from(request).orElseThrow(InvalidTokenException::new);
    return remembered(accessService.restore(gameId, cookieToken), request, response);
  }

  @PostMapping("/players/{playerId}/rejoin-code")
  @SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
  @Operation(
    operationId = "createRejoinCode",
    summary = "Make a one-time code for a player to rejoin with",
    description = """
      Host only, in any phase. For a player who lost their place, to open as a link on any browser or device.       Replaces the player's earlier code.""",
    responses = {
      @ApiResponse(responseCode = "200", description = "The code, and when it expires"),
      @ApiResponse(responseCode = "403", description = "Not the host"),
      @ApiResponse(responseCode = "404", description = "No such player in this game")
    }
  )
  public RejoinCodeDTO createRejoinCode(@PathVariable UUID gameId, @PathVariable UUID playerId,
                                        @CurrentPlayer GamePlayerEntity host) {
    return accessService.createRejoinCode(host, playerId);
  }

  @PostMapping("/rejoin")
  @Operation(
    operationId = "rejoinGame",
    summary = "Rejoin the game with a code from the host",
    description = "Works once. Returns a new token for the player; the browser that held their place before loses it.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The game, and the player's ID and new token"),
      @ApiResponse(responseCode = "404", description = "No game, or no such code in it (it may have been used)"),
      @ApiResponse(responseCode = "410", description = "The code has expired")
    }
  )
  public JoinedGameDTO rejoinGame(@PathVariable UUID gameId, @RequestBody GameRequests.RejoinRequest request,
                                  HttpServletRequest httpRequest, HttpServletResponse response) {
    return remembered(accessService.rejoin(gameId, request.code()), httpRequest, response);
  }

  static JoinedGameDTO remembered(JoinedGameDTO joined, HttpServletRequest request, HttpServletResponse response) {
    PlayerCookie.set(request, response, joined.gameId(), joined.playerToken());
    return joined;
  }
}
