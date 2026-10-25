package com.jetlag.game.session;

import com.jetlag.game.events.EventAudience;
import com.jetlag.game.events.GameEventLog;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Playing a running game: the stations, the seekers' positions and the hiders' station. The seekers' positions
 * and the station are recorded as events for the hiders only.
 */
@Service
public class GamePlayService {

  /** A seeker's position for the hiders, as a {@link SeekerLocationDTO}. */
  public static final String SEEKER_LOCATION_EVENT = "seeker-location";
  /** The hiders' station, as a {@link HidingStationDTO}. */
  public static final String HIDING_STATION_EVENT = "hiding-station";
  /** Reports closer together than this are not passed on; the client sends about every 10 seconds. */
  static final Duration MIN_REPORT_INTERVAL = Duration.ofSeconds(5);

  private static final GeometryFactory WGS84 = new GeometryFactory(new PrecisionModel(), 4326);

  private final GameRepository gameRepository;
  private final GamePlayerRepository playerRepository;
  private final GameStations stations;
  private final HidingSpots hidingSpots;
  private final GameEventLog eventLog;
  private final Clock clock;

  public GamePlayService(GameRepository gameRepository, GamePlayerRepository playerRepository, GameStations stations,
                         HidingSpots hidingSpots, GameEventLog eventLog, Clock clock) {
    this.gameRepository = gameRepository;
    this.playerRepository = playerRepository;
    this.stations = stations;
    this.hidingSpots = hidingSpots;
    this.eventLog = eventLog;
    this.clock = clock;
  }

  /** The stations of the player's game. Every player may see them; they are not where the hiders are. */
  @Transactional(readOnly = true)
  public List<StationDTO> stations(GamePlayerEntity player) {
    return stations.list(player.getGame().getId());
  }

  /** A seeker's position, while the game runs. Reports too close to the previous one are accepted but not passed on. */
  @Transactional
  public void reportLocation(GamePlayerEntity reporter, GameRequests.LocationRequest request) {
    double longitude = request.longitude();
    double latitude = request.latitude();
    if (!Double.isFinite(longitude) || !Double.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Position out of range");
    }
    Float accuracy = request.accuracyMeters();
    if (accuracy != null && (!Float.isFinite(accuracy) || accuracy < 0)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The accuracy must be a distance in metres");
    }

    GameEntity game = lock(reporter);
    GamePlayerEntity seeker = playerRepository.findById(reporter.getId()).orElseThrow();
    if (seeker.getRole() != PlayerRole.SEEKER) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seekers share their position");
    }
    if (game.getStatus() != GameStatus.HIDING && game.getStatus() != GameStatus.SEEKING) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Positions are only shared while the game runs");
    }

    Instant now = clock.instant();
    if (seeker.getLastLocationAt() != null && seeker.getLastLocationAt().plus(MIN_REPORT_INTERVAL).isAfter(now)) return;
    seeker.setLastLocation(WGS84.createPoint(new Coordinate(longitude, latitude)), accuracy, now);
    playerRepository.flush();
    eventLog.record(game.getId(), SEEKER_LOCATION_EVENT, EventAudience.HIDERS, SeekerLocationDTO.from(seeker));
  }

  /** A hider chooses where the hiders hide, or changes it, until the hiding time is up. */
  @Transactional
  public HidingStationDTO chooseHidingStation(GamePlayerEntity chooser, String stationId) {
    GameEntity game = lock(chooser);
    GamePlayerEntity hider = playerRepository.findById(chooser.getId()).orElseThrow();
    if (hider.getRole() != PlayerRole.HIDER) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only hiders choose the hiding station");
    }
    Instant now = clock.instant();
    // The scheduled move to seeking may not have run yet; the time is what counts
    boolean hiding = game.getStatus() == GameStatus.HIDING && now.isBefore(game.getHidingEndsAt());
    if (!hiding) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The station can only be chosen during the hiding time");
    }
    StationDTO station = stations.find(game.getId(), stationId == null ? "" : stationId)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not one of this game's stations"));

    hidingSpots.choose(game.getId(), station.stationId(), hider.getId(), now);
    HidingStationDTO chosen = new HidingStationDTO(station, hider.getId(), now);
    eventLog.record(game.getId(), HIDING_STATION_EVENT, EventAudience.HIDERS, chosen);
    return chosen;
  }

  private GameEntity lock(GamePlayerEntity player) {
    UUID gameId = player.getGame().getId();
    return gameRepository.findForUpdate(gameId)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Game not found"));
  }
}
