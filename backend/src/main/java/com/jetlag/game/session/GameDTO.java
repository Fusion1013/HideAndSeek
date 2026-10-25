package com.jetlag.game.session;

import com.jetlag.game.Boundaries;
import com.jetlag.game.RouteSnapshot;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * A game's state as every player may see it: sent in events to all players, so anything only some roles may see
 * (such as the hiding place) must never be added to it.
 */
public record GameDTO(
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String inviteCode,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) GameStatus status,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int hidingMinutes,
  Instant hidingStartedAt,
  @Schema(description = "When the seekers may set off; set once the game starts") Instant hidingEndsAt,
  Instant seekingStartedAt,
  Instant finishedAt,
  @Schema(description = "The play area's outline as a closed ring of [longitude, latitude] positions",
    requiredMode = Schema.RequiredMode.REQUIRED)
  List<List<Double>> boundary,
  @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<GameRouteDTO> routes,
  @Schema(description = "How many stations the hiders can choose from", requiredMode = Schema.RequiredMode.REQUIRED)
  int stationCount,
  @Schema(description = "In the order they joined", requiredMode = Schema.RequiredMode.REQUIRED)
  List<PlayerDTO> players
) {

  public record GameRouteDTO(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String routeId,
    String routeShortName,
    String agencyName,
    String routeType
  ) {
  }

  public record PlayerDTO(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String displayName,
    @Schema(description = "Null until the host hands out roles") PlayerRole role,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean host
  ) {
    static PlayerDTO from(GamePlayerEntity player) {
      return new PlayerDTO(player.getId(), player.getDisplayName(), player.getRole(), player.isHost());
    }
  }

  static GameDTO from(GameEntity game, List<GamePlayerEntity> players, int stationCount) {
    List<GameRouteDTO> routes = game.getRoutes().stream()
      .sorted(Comparator.comparing(RouteSnapshot::routeId))
      .map(route -> new GameRouteDTO(route.routeId(), route.routeShortName(), route.agencyName(), route.routeType()))
      .toList();
    return new GameDTO(game.getId(), game.getName(), game.getInviteCode(), game.getStatus(), game.getHidingMinutes(),
      game.getHidingStartedAt(), game.getHidingEndsAt(), game.getSeekingStartedAt(), game.getFinishedAt(),
      Boundaries.toRing(game.getBoundary()), routes, stationCount, players.stream().map(PlayerDTO::from).toList());
  }
}
