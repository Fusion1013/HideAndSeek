import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import Feature, { type FeatureLike } from 'ol/Feature';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon, { circular } from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

import type { PlayerDTO, QuestionDTO, StationDTO } from '../api/generated';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { MapService } from '../map/map.service';
import { formatAge } from '../shared/format';
import { RouteSelectionService } from '../transit/route-selection.service';
import { GameSessionService } from './game-session.service';
import { answerText, questionKind } from './questions';
import { GameReplayService } from './replay/game-replay.service';

/** Above the routes, below the measuring shapes. */
const Z_INDEX = { area: 880, questions: 885, paths: 887, stations: 890, questionPins: 893, players: 895 };

const AREA_STYLE = [
  new Style({ stroke: new Stroke({ color: '#ffffff', width: 6 }) }),
  new Style({ stroke: new Stroke({ color: '#087e8b', width: 3, lineDash: [10, 6] }) })
];

const STATION_STYLE = new Style({
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#17232b', width: 2 }) })
});
const PICKED_STATION_STYLE = new Style({
  image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#fff4e5' }), stroke: new Stroke({ color: '#a85d00', width: 3 }) })
});
const HIDING_STATION_STYLE = new Style({
  image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#a85d00' }), stroke: new Stroke({ color: '#ffffff', width: 3 }) })
});
const SEEKER_COLOR = '#2d5bb8';
const HIDER_COLOR = '#a85d00';
const QUESTION_COLOR = '#7b3fa0';

/** A pin where a question was asked from. */
const QUESTION_PIN_STYLE = new Style({
  image: new CircleStyle({ radius: 10, fill: new Fill({ color: QUESTION_COLOR }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }),
  text: new Text({ text: '?', font: '700 13px system-ui, sans-serif', fill: new Fill({ color: '#ffffff' }) })
});

/** Radar and tentacles questions are about a circle around where the asking seeker was. */
const CIRCLE_QUESTIONS: readonly QuestionDTO.TypeEnum[] = ['RADAR', 'TENTACLES'];
/** Points around each circle, enough for it to look round at any zoom. */
const CIRCLE_POINTS = 96;

/** Pixels around a click in which a station counts as clicked; a fingertip is wider than a marker. */
const HIT_TOLERANCE = 12;

/**
 * The game on the map while its page is open: the play area, the game's routes and stations, the hiders' station
 * and the seekers' last positions (both for hiders only), and the questions. A click on a station picks it for
 * the hiding tab. Once the game is over, its replay takes the place of the live state: everyone's paths up to the
 * moment chosen on the timeline, and the questions and station as they were then. One per game page; everything
 * is taken off the map when the page closes, and the Overview selection returns.
 */
@Injectable()
export class GameMapService {
  private readonly session = inject(GameSessionService);
  private readonly mapService = inject(MapService);
  private readonly routeSelection = inject(RouteSelectionService);
  private readonly controls = inject(ControlsPanelService);
  private readonly replay = inject(GameReplayService);

  private readonly areaSource = new VectorSource<Feature<Polygon>>();
  private readonly stationSource = new VectorSource<Feature<Point>>();
  private readonly playerSource = new VectorSource<Feature<Point>>();
  private readonly pathSource = new VectorSource<Feature<LineString>>();
  private readonly questionSource = new VectorSource<Feature<Polygon>>();
  private readonly questionPinSource = new VectorSource<Feature<Point>>();
  private readonly layers = [
    new VectorLayer({ source: this.areaSource, style: AREA_STYLE, zIndex: Z_INDEX.area }),
    new VectorLayer({ source: this.questionSource, style: feature => questionStyle(feature), zIndex: Z_INDEX.questions }),
    new VectorLayer({ source: this.stationSource, style: feature => this.stationStyle(feature), zIndex: Z_INDEX.stations }),
    new VectorLayer({ source: this.pathSource, style: feature => pathStyle(feature), zIndex: Z_INDEX.paths }),
    new VectorLayer({ source: this.questionPinSource, style: QUESTION_PIN_STYLE, zIndex: Z_INDEX.questionPins }),
    new VectorLayer({ source: this.playerSource, style: feature => playerStyle(feature), zIndex: Z_INDEX.players })
  ];
  private map: OlMap | null = null;
  private readonly stationLayer = this.layers[2];

  /** A station clicked on the map, offered in the hiding tab. */
  readonly pickedStation = signal<StationDTO | null>(null);

  /** The questions shown: as they are now, or as they were at the replay's moment. */
  private readonly shownQuestions = computed(() => this.replay.frame()?.questions ?? this.session.questions());
  /** The hiders' station shown: as it is now (to whoever may see it), or as it was at the replay's moment. */
  private readonly shownHidingStation = computed(() => {
    const frame = this.replay.frame();
    return frame ? frame.hidingStation : this.session.hidingStation();
  });

  /** The device's clock, for how long ago each seeker was seen; ticks every 15 seconds. */
  private readonly now = signal(Date.now());

  /** The seekers' last positions with their names and ages, for the map and the list. */
  readonly seekers = computed(() => {
    const players = new Map((this.session.game()?.players ?? []).map(player => [player.id, player.displayName] as const));
    const now = this.session.serverNow(this.now());
    return [...this.session.seekerLocations().values()].map(location => ({
      ...location,
      displayName: players.get(location.playerId) ?? 'Seeker',
      age: formatAge(now - Date.parse(location.recordedAt))
    }));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const map = this.mapService.getMap();
      if (map && map !== this.map) untracked(() => this.attach(map));
    });

    // The game's area, fitted into view once it is known
    let fitted = false;
    effect(() => {
      const ring = this.session.game()?.boundary ?? [];
      // Read so the first fit also happens when the game arrives before the map
      this.mapService.getMap();
      this.areaSource.clear();
      if (ring.length < 4) return;
      const polygon = new Polygon([ring.map(([longitude, latitude]) => fromLonLat([longitude, latitude]))]);
      this.areaSource.addFeature(new Feature(polygon));
      if (!fitted && this.map) {
        fitted = true;
        this.map.getView().fit(polygon.getExtent(), { padding: [48, 48, 48, 48], duration: 300 });
      }
    });

    effect(() => {
      const features = this.session.stations().map(station => {
        const feature = new Feature(new Point(fromLonLat([station.longitude, station.latitude])));
        feature.set('station', station);
        return feature;
      });
      this.stationSource.clear(true);
      this.stationSource.addFeatures(features);
    });

    // Restyles the stations when the pick or the hiding station changes
    effect(() => {
      this.pickedStation();
      this.shownHidingStation();
      this.stationSource.changed();
    });

    // The players: in the replay, everyone where they were then; while the game runs, the seekers last seen
    effect(() => {
      const frame = this.replay.frame();
      const markers: { position: readonly [number, number]; role: PlayerDTO.RoleEnum | undefined; label: string }[] = frame
        ? frame.players.flatMap(({ player, position }) => position ? [{ position, role: player.role, label: player.displayName }] : [])
        : this.seekers().map(seeker => ({
          position: [seeker.longitude, seeker.latitude] as const,
          role: 'SEEKER' as const,
          label: `${seeker.displayName} · ${seeker.age}`
        }));
      this.playerSource.clear(true);
      this.playerSource.addFeatures(markers.map(marker => {
        const feature = new Feature(new Point(fromLonLat([...marker.position])));
        feature.set('label', marker.label);
        feature.set('role', marker.role);
        return feature;
      }));
    });

    // Where everyone went, in the replay
    effect(() => {
      const paths = this.replay.frame()?.players.filter(player => player.path.length > 1) ?? [];
      this.pathSource.clear(true);
      this.pathSource.addFeatures(paths.map(({ player, path }) => {
        const feature = new Feature(new LineString(path.map(point => fromLonLat([...point]))));
        feature.set('role', player.role);
        return feature;
      }));
    });

    // Where each question was asked from, whatever its kind
    effect(() => {
      this.questionPinSource.clear(true);
      this.questionPinSource.addFeatures(this.shownQuestions()
        .filter(question => question.params.origin)
        .map(question => new Feature(new Point(fromLonLat([question.params.origin!.longitude, question.params.origin!.latitude])))));
    });

    // Radar and tentacles circles, true to the distance on the ground (a circle in the map's projection is not)
    effect(() => {
      this.questionSource.clear(true);
      this.questionSource.addFeatures(this.shownQuestions()
        .filter(question => CIRCLE_QUESTIONS.includes(question.type) && question.params.origin && question.params.distanceMeters)
        .map(question => {
          const { longitude, latitude } = question.params.origin!;
          const circle = circular([longitude, latitude], question.params.distanceMeters!, CIRCLE_POINTS)
            .transform('EPSG:4326', 'EPSG:3857') as Polygon;
          const feature = new Feature(circle);
          feature.set('question', question);
          return feature;
        }));
    });

    // The game's routes take the place of the Overview selection, without the routes' own stops
    const overviewRouteIds = untracked(this.routeSelection.selectedRouteIds);
    this.routeSelection.fitView.set(false);
    this.routeSelection.showStops.set(false);
    effect(() => this.routeSelection.select((this.session.game()?.routes ?? []).map(route => route.routeId)));

    const ticker = setInterval(() => this.now.set(Date.now()), 15_000);

    destroyRef.onDestroy(() => {
      clearInterval(ticker);
      this.detach();
      this.routeSelection.fitView.set(true);
      this.routeSelection.showStops.set(true);
      this.routeSelection.select(overviewRouteIds);
    });
  }

  private attach(map: OlMap): void {
    this.detach();
    this.map = map;
    this.layers.forEach(layer => map.addLayer(layer));
    map.on('singleclick', this.handleClick);
  }

  private detach(): void {
    if (!this.map) return;
    this.layers.forEach(layer => this.map?.removeLayer(layer));
    this.map.un('singleclick', this.handleClick);
    this.map = null;
  }

  /** A click on a station, while the hiders may still choose, offers it in the hiding tab. */
  private readonly handleClick = (event: MapBrowserEvent): void => {
    if (!this.session.canChooseStation() || !this.map) return;
    const station = this.map.forEachFeatureAtPixel(event.pixel, feature => feature.get('station') as StationDTO | undefined, {
      layerFilter: layer => layer === this.stationLayer,
      hitTolerance: HIT_TOLERANCE
    });
    if (!station) return;
    this.pickedStation.set(station);
    this.controls.show('hiding');
  };

  private stationStyle(feature: FeatureLike): Style {
    const station = feature.get('station') as StationDTO | undefined;
    if (station && station.stationId === this.shownHidingStation()?.station.stationId) return HIDING_STATION_STYLE;
    if (station && station.stationId === this.pickedStation()?.stationId) return PICKED_STATION_STYLE;
    return STATION_STYLE;
  }
}

/** Green where the hiders said they are within it, red where they said they are not, dashed while unanswered. */
function questionStyle(feature: FeatureLike): Style {
  const question = feature.get('question') as QuestionDTO;
  const choice = question.answer?.choice;
  const inside = choice === 'YES' || choice === 'PLACE';
  const outside = choice === 'NO' || choice === 'NONE';
  const color = inside ? '#2e7d32' : outside ? '#b33232' : SEEKER_COLOR;
  return new Style({
    stroke: new Stroke({ color, width: 2, lineDash: inside || outside ? undefined : [8, 6] }),
    fill: new Fill({ color: inside ? 'rgba(46, 125, 50, 0.10)' : outside ? 'rgba(179, 50, 50, 0.06)' : 'rgba(45, 91, 184, 0.05)' }),
    text: new Text({
      text: `${questionKind(question.type).label}: ${answerText(question)}`,
      placement: 'line',
      font: '600 12px system-ui, sans-serif',
      fill: new Fill({ color: '#17232b' }),
      stroke: new Stroke({ color: '#ffffff', width: 4 })
    })
  });
}

function roleColor(feature: FeatureLike): string {
  return feature.get('role') === 'HIDER' ? HIDER_COLOR : SEEKER_COLOR;
}

function playerStyle(feature: FeatureLike): Style {
  return new Style({
    image: new CircleStyle({ radius: 9, fill: new Fill({ color: roleColor(feature) }), stroke: new Stroke({ color: '#ffffff', width: 3 }) }),
    text: new Text({
      text: String(feature.get('label') ?? ''),
      offsetY: -20,
      font: '600 13px system-ui, sans-serif',
      fill: new Fill({ color: '#17232b' }),
      stroke: new Stroke({ color: '#ffffff', width: 4 })
    })
  });
}

function pathStyle(feature: FeatureLike): Style[] {
  return [
    new Style({ stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.9)', width: 7 }) }),
    new Style({ stroke: new Stroke({ color: roleColor(feature), width: 3.5 }) })
  ];
}
