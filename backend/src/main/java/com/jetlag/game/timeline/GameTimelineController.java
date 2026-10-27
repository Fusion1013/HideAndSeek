package com.jetlag.game.timeline;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import com.jetlag.game.session.GamePlayerEntity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** A finished game's timeline, for its replay. */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api/games/{gameId}", produces = MediaType.APPLICATION_JSON_VALUE)
@SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
public class GameTimelineController {

  private final GameTimelineService timelineService;

  public GameTimelineController(GameTimelineService timelineService) {
    this.timelineService = timelineService;
  }

  @GetMapping("/timeline")
  @Operation(
    operationId = "getGameTimeline",
    summary = "Get the timeline of a finished game",
    description = "Every player's positions, seekers' and hiders', and what happened when. Any player of the game, "
      + "once it is over.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The timeline"),
      @ApiResponse(responseCode = "401", description = "No valid player token"),
      @ApiResponse(responseCode = "403", description = "The token belongs to another game"),
      @ApiResponse(responseCode = "409", description = "The game is not over yet")
    }
  )
  public GameTimelineDTO getGameTimeline(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    return timelineService.timeline(player);
  }
}
