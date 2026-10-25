package com.jetlag.game.session;

import com.jetlag.game.auth.CurrentPlayer;
import com.jetlag.game.auth.GameAuthConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Playing a running game: its stations, the seekers' positions, the hiders' station. */
@RestController
// Declared, so the API document says JSON rather than */*; the generated client reads */* responses as blobs
@RequestMapping(value = "/api/games/{gameId}", produces = MediaType.APPLICATION_JSON_VALUE)
@SecurityRequirement(name = GameAuthConfig.PLAYER_TOKEN)
public class GamePlayController {

  private final GamePlayService playService;

  public GamePlayController(GamePlayService playService) {
    this.playService = playService;
  }

  @GetMapping("/stations")
  @Operation(
    operationId = "getGameStations",
    summary = "Get the stations the hiders can choose from",
    responses = @ApiResponse(responseCode = "200", description = "The stations, by name")
  )
  public List<StationDTO> getGameStations(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player) {
    return playService.stations(player);
  }

  @PostMapping("/location")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Operation(
    operationId = "reportLocation",
    summary = "Share a seeker's position with the hiders",
    description = "Seekers only, while the game runs. Reports less than 5 seconds apart are accepted but not passed on.",
    responses = {
      @ApiResponse(responseCode = "204", description = "Accepted"),
      @ApiResponse(responseCode = "400", description = "Position out of range"),
      @ApiResponse(responseCode = "403", description = "Not a seeker"),
      @ApiResponse(responseCode = "409", description = "The game is not running")
    }
  )
  public void reportLocation(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                             @RequestBody GameRequests.LocationRequest request) {
    playService.reportLocation(player, request);
  }

  @PutMapping("/hiding-station")
  @Operation(
    operationId = "chooseHidingStation",
    summary = "Choose where the hiders hide",
    description = "Hiders only, during the hiding time; any hider may change it until then. Never shown to seekers.",
    responses = {
      @ApiResponse(responseCode = "200", description = "The chosen station"),
      @ApiResponse(responseCode = "400", description = "Not one of the game's stations"),
      @ApiResponse(responseCode = "403", description = "Not a hider"),
      @ApiResponse(responseCode = "409", description = "Not during the hiding time")
    }
  )
  public HidingStationDTO chooseHidingStation(@PathVariable UUID gameId, @CurrentPlayer GamePlayerEntity player,
                                              @RequestBody GameRequests.HidingStationRequest request) {
    return playService.chooseHidingStation(player, request.stationId());
  }
}
