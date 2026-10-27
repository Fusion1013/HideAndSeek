package com.jetlag.game.template;

import com.jetlag.game.Boundaries;
import com.jetlag.game.RouteSnapshot;
import com.jetlag.game.auth.AccessTokens;
import com.jetlag.game.auth.InvalidTokenException;
import com.jetlag.game.session.GameStations;
import com.jetlag.game.session.StationDTO;
import com.jetlag.transit.model.AgencyRouteEntity;
import com.jetlag.transit.repository.AgencyRouteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Creating, reading and changing templates. Anyone with a template's ID may read it; only its owner may change it. */
@Service
public class GameTemplateService {

  /** Stays well below PostgreSQL's 65 535 parameters when the routes are looked up. */
  static final int MAX_ROUTES = 5000;
  static final int MAX_LISTED = 100;

  private final GameTemplateRepository templateRepository;
  private final AgencyRouteRepository agencyRouteRepository;
  private final GameStations stations;

  public GameTemplateService(GameTemplateRepository templateRepository, AgencyRouteRepository agencyRouteRepository,
                             GameStations stations) {
    this.templateRepository = templateRepository;
    this.agencyRouteRepository = agencyRouteRepository;
    this.stations = stations;
  }

  @Transactional
  public CreatedTemplateDTO create(TemplateRequest request) {
    AccessTokens.IssuedToken token = AccessTokens.issue();
    GameTemplateEntity template = new GameTemplateEntity(validName(request.name()),
      Boundaries.toPolygon(request.boundary()), token.hash());
    template.setRoutes(snapshotRoutes(request.routeIds(), Set.of()));
    templateRepository.saveAndFlush(template);
    return new CreatedTemplateDTO(toDTO(template), token.token());
  }

  @Transactional(readOnly = true)
  public TemplateDTO get(UUID id) {
    return toDTO(find(id));
  }

  /** The templates that exist among the IDs, in the order asked for; unknown IDs are left out. */
  @Transactional(readOnly = true)
  public List<TemplateDTO> list(Collection<UUID> ids) {
    if (ids.size() > MAX_LISTED) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most " + MAX_LISTED + " templates at a time");
    }
    Map<UUID, GameTemplateEntity> byId = templateRepository.findAllById(ids).stream()
      .collect(Collectors.toMap(GameTemplateEntity::getId, Function.identity()));
    return ids.stream().distinct().map(byId::get).filter(template -> template != null).map(this::toDTO).toList();
  }

  /** The stations a game from the template would have, as the timetable is now. */
  @Transactional(readOnly = true)
  public List<StationDTO> stations(UUID id) {
    GameTemplateEntity template = find(id);
    return stations.forTemplate(template.getId(), template.getRoutes().stream().map(RouteSnapshot::routeId).toList());
  }

  @Transactional
  public TemplateDTO update(UUID id, String ownerToken, TemplateRequest request) {
    GameTemplateEntity template = findOwned(id, ownerToken);
    template.setName(validName(request.name()));
    template.setBoundary(Boundaries.toPolygon(request.boundary()));
    template.setRoutes(snapshotRoutes(request.routeIds(), template.getRoutes()));
    templateRepository.saveAndFlush(template);
    return toDTO(template);
  }

  @Transactional
  public void delete(UUID id, String ownerToken) {
    templateRepository.delete(findOwned(id, ownerToken));
  }

  private GameTemplateEntity find(UUID id) {
    return templateRepository.findById(id)
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found: " + id));
  }

  private GameTemplateEntity findOwned(UUID id, String ownerToken) {
    if (ownerToken == null) throw new InvalidTokenException();
    GameTemplateEntity template = find(id);
    if (!AccessTokens.matches(ownerToken, template.getOwnerTokenHash())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the template's owner can change it");
    }
    return template;
  }

  private static String validName(String name) {
    String trimmed = name == null ? "" : name.strip();
    if (trimmed.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The template needs a name");
    }
    if (trimmed.length() > TemplateRequest.MAX_NAME_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "The name is longer than " + TemplateRequest.MAX_NAME_LENGTH + " characters");
    }
    return trimmed;
  }

  /**
   * The routes with their current names. A route the GTFS data no longer has may stay if the template already had
   * it (it keeps its old names); a new route must exist.
   */
  private Set<RouteSnapshot> snapshotRoutes(List<String> routeIds, Set<RouteSnapshot> existing) {
    Set<String> ids = routeIds == null ? Set.of() : new LinkedHashSet<>(routeIds);
    if (ids.size() > MAX_ROUTES) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most " + MAX_ROUTES + " routes");
    }

    Map<String, AgencyRouteEntity> current = agencyRouteRepository.findAllById(ids).stream()
      .collect(Collectors.toMap(AgencyRouteEntity::getRouteId, Function.identity()));
    Map<String, RouteSnapshot> previous = existing.stream()
      .collect(Collectors.toMap(RouteSnapshot::routeId, Function.identity()));

    Set<RouteSnapshot> snapshots = new HashSet<>();
    for (String routeId : ids) {
      AgencyRouteEntity route = current.get(routeId);
      if (route != null) {
        snapshots.add(new RouteSnapshot(routeId, route.getRouteShortName(), route.getAgencyName(), route.getRouteType()));
      } else if (previous.containsKey(routeId)) {
        snapshots.add(previous.get(routeId));
      } else {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown route: " + routeId);
      }
    }
    return snapshots;
  }

  private TemplateDTO toDTO(GameTemplateEntity template) {
    Set<String> routeIds = template.getRoutes().stream().map(RouteSnapshot::routeId).collect(Collectors.toSet());
    Set<String> available = agencyRouteRepository.findAllById(routeIds).stream()
      .map(AgencyRouteEntity::getRouteId)
      .collect(Collectors.toSet());
    return TemplateDTO.from(template, available);
  }
}
