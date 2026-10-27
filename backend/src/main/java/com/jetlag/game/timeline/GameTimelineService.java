package com.jetlag.game.timeline;

import com.jetlag.game.session.GameDTO;
import com.jetlag.game.session.GamePlayerEntity;
import com.jetlag.game.session.GamePositions;
import com.jetlag.game.session.GameService;
import com.jetlag.game.session.GameStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The timeline of a finished game, for its replay. Only once it is over: it shows where the hiders went and hid,
 * which the seekers must not see while it runs.
 */
@Service
public class GameTimelineService {

  private static final Comparator<TimelineEventDTO> IN_ORDER =
    Comparator.comparing(TimelineEventDTO::at).thenComparing(TimelineEventDTO::type);

  private final GameService gameService;
  private final GamePositions positions;
  private final List<TimelineSource> sources;

  public GameTimelineService(GameService gameService, GamePositions positions, List<TimelineSource> sources) {
    this.gameService = gameService;
    this.positions = positions;
    this.sources = sources;
  }

  @Transactional
  public GameTimelineDTO timeline(GamePlayerEntity player) {
    GameDTO game = gameService.get(player).game();
    if (game.status() != GameStatus.FINISHED) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The timeline is shown once the game is over");
    }
    List<TimelineEventDTO> events = sources.stream()
      .flatMap(source -> source.events(game).stream())
      .sorted(IN_ORDER)
      .toList();
    return new GameTimelineDTO(game, tracks(game.id()), events);
  }

  private List<PlayerTrackDTO> tracks(UUID gameId) {
    Map<UUID, List<TrackPointDTO>> byPlayer = new LinkedHashMap<>();
    for (GamePositions.Position position : positions.list(gameId)) {
      byPlayer.computeIfAbsent(position.playerId(), playerId -> new ArrayList<>()).add(new TrackPointDTO(
        position.longitude(), position.latitude(), position.accuracyMeters(), position.recordedAt()));
    }
    return byPlayer.entrySet().stream().map(entry -> new PlayerTrackDTO(entry.getKey(), entry.getValue())).toList();
  }
}
