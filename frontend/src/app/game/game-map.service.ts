import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import Feature, { type FeatureLike } from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type Geometry from 'ol/geom/Geometry';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import LineString from 'ol/geom/LineString';
import MultiPolygon from 'ol/geom/MultiPolygon';
import Point from 'ol/geom/Point';
import Polygon, { circular } from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import type OlMap from 'ol/Map';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from 'ol/style';
import type { LucideIconData } from '@lucide/angular';

import type { PlayerDTO, Position, QuestionDTO, StationDTO } from '../api/generated';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { MapService } from '../map/map.service';
import { LonLat, perpendicularBisector } from '../shared/bisector';
import { formatAge, formatDistance } from '../shared/format';
import { RouteSelectionService } from '../transit/route-selection.service';
import { GameSessionService } from './game-session.service';
import { excludedArea } from './excluded-area';
import { QuestionPreviewService } from './question-preview.service';
import { CIRCLE_POINTS, CIRCLE_QUESTIONS, mapLabel, QUESTION_KINDS } from './questions';
import { GameReplayService } from './replay/game-replay.service';
import { ThermometerDraftService } from './thermometer-draft.service';

/** Above the routes, below the measuring shapes. */
const Z_INDEX = { excluded: 878, area: 880, questions: 885, paths: 887, stations: 890, questionPins: 893, players: 895 };

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
/** Where the answers so far rule the hiders out. */
const EXCLUDED_STYLE = new Style({
  fill: new Fill({ color: 'rgba(23, 35, 43, 0.38)' }),
  stroke: new Stroke({ color: '#17232b', width: 1.5 })
});
const SEEKER_COLOR = '#2d5bb8';
const HIDER_COLOR = '#a85d00';
const QUESTION_COLOR = '#7b3fa0';

/** A pin's size on the screen, in pixels, and how much sharper it is made: enough for a phone's screen. */
const PIN_SIZE = 28;
const PIN_SHARPNESS = 3;

/** A pin in the question colour with the icon on it, as an image. */
function pinImage(icon: LucideIconData): string {
  const shapes = icon.node.map(([name, attributes]) => {
    const drawn = Object.entries(attributes).filter(([attribute]) => attribute !== 'key');
    return `<${name} ${drawn.map(([attribute, value]) => `${attribute}="${value}"`).join(' ')}/>`;
  });
  const size = PIN_SIZE * PIN_SHARPNESS;
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="${QUESTION_COLOR}" stroke="#ffffff" stroke-width="2"/>
      <g transform="translate(6 6) scale(0.6667)" fill="none" stroke="#ffffff" stroke-width="2.25"
        stroke-linecap="round" stroke-linejoin="round">${shapes.join('')}</g>
    </svg>`)}`;
}

/** The pins where questions were asked from, by kind. */
const QUESTION_PIN_STYLES = new Map(QUESTION_KINDS.map(kind => [kind.type, new Style({
  image: new Icon({ src: pinImage(kind.icon), scale: 1 / PIN_SHARPNESS })
})]));

export function questionPinStyle(question: Pick<QuestionDTO, 'type'>): Style {
  return QUESTION_PIN_STYLES.get(question.type)!;
}

const GEO_JSON = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

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
  private readonly draft = inject(ThermometerDraftService);
  private readonly preview = inject(QuestionPreviewService);

  private readonly areaSource = new VectorSource<Feature<Polygon>>();
  private readonly stationSource = new VectorSource<Feature<Point>>();
  private readonly playerSource = new VectorSource<Feature<Point>>();
  private readonly pathSource = new VectorSource<Feature<LineString>>();
  private readonly questionSource = new VectorSource<Feature<Geometry>>();
  private readonly draftSource = new VectorSource<Feature<Geometry>>();
  private readonly questionPinSource = new VectorSource<Feature<Point>>();
  private readonly excludedSource = new VectorSource<Feature<MultiPolygon>>();
  private readonly layers = [
    new VectorLayer({ source: this.areaSource, style: AREA_STYLE, zIndex: Z_INDEX.area }),
    new VectorLayer({ source: this.questionSource, style: feature => questionStyle(feature), zIndex: Z_INDEX.questions }),
    new VectorLayer({ source: this.draftSource, style: feature => questionStyle(feature), zIndex: Z_INDEX.questions }),
    new VectorLayer({ source: this.stationSource, style: feature => this.stationStyle(feature), zIndex: Z_INDEX.stations }),
    new VectorLayer({ source: this.pathSource, style: feature => pathStyle(feature), zIndex: Z_INDEX.paths }),
    new VectorLayer({ source: this.questionPinSource, style: feature => questionPinStyle(feature.get('question')), zIndex: Z_INDEX.questionPins }),
    new VectorLayer({ source: this.playerSource, style: feature => playerStyle(feature), zIndex: Z_INDEX.players }),
    new VectorLayer({ source: this.excludedSource, style: EXCLUDED_STYLE, zIndex: Z_INDEX.excluded })
  ];
  private map: OlMap | null = null;
  private readonly stationLayer = this.layers[3];

  /** A station clicked on the map, offered in the hiding tab. */
  readonly pickedStation = signal<StationDTO | null>(null);

  /** The questions shown: as they are now, or as they were at the replay's moment. */
  private readonly shownQuestions = computed(() => this.replay.frame()?.questions ?? this.session.questions());
  /** The answered questions shown; only a new answer changes these, not every step of the replay. */
  private readonly answeredQuestions = computed(() => this.shownQuestions().filter(question => question.answer), {
    equal: (a, b) => a.length === b.length && a.every((question, index) => question.id === b[index].id)
  });
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
      const preview = this.preview.question();
      this.questionPinSource.addFeatures([...this.shownQuestions(), ...(preview ? [preview] : [])]
        .filter(question => question.params.origin)
        .map(question => {
          const feature = new Feature(new Point(fromLonLat([question.params.origin!.longitude, question.params.origin!.latitude])));
          feature.set('question', question);
          return feature;
        }));
    });

    // Everywhere the answers so far, live or at the replay's moment, rule the hiders out
    effect(() => {
      const excluded = excludedArea(this.session.game()?.boundary ?? [], this.answeredQuestions());
      this.excludedSource.clear(true);
      if (excluded.length === 0) return;
      this.excludedSource.addFeature(new Feature(new MultiPolygon(excluded).transform('EPSG:4326', 'EPSG:3857') as MultiPolygon));
    });

    effect(() => {
      this.questionSource.clear(true);
      this.questionSource.addFeatures(this.shownQuestions().flatMap(question => questionFeatures(question)));
    });

    // The question being chosen, as it will look once asked; a thermometer's points are set on the map
    effect(() => {
      const preview = this.preview.question();
      const { start, end } = this.draft.shown();
      this.draftSource.clear(true);
      if (preview) this.draftSource.addFeatures(questionFeatures(preview));
      if (start && end) {
        this.draftSource.addFeatures(thermometerFeatures(start, end));
      } else if (start || end) {
        this.draftSource.addFeature(thermometerPart('point', new Point(fromLonLat(lonLat((start ?? end)!)))));
      }
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

  /**
   * A click places the point of a thermometer question being picked. Otherwise a click on a station, while the
   * hiders may still choose, offers it in the hiding tab.
   */
  private readonly handleClick = (event: MapBrowserEvent): void => {
    const picking = this.draft.picking();
    if (picking) {
      const [longitude, latitude] = toLonLat(event.coordinate);
      this.draft.set(picking, { longitude, latitude });
      this.controls.show('questions');
      return;
    }
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

/**
 * A question on the map: radar and tentacles circles, true to the distance on the ground (a circle in the map's
 * projection is not), each thermometer's points with the line between hotter and colder, and the places questions
 * are about. Once answered, what a question divides belongs to the excluded area.
 */
export function questionFeatures(question: QuestionDTO): Feature<Geometry>[] {
  const { origin, distanceMeters, start, end } = question.params;
  const features = start && end ? thermometerFeatures(start, end, question) : [];
  if (!question.answer && CIRCLE_QUESTIONS.includes(question.type) && origin && distanceMeters) {
    const circle = new Feature<Geometry>(circular([origin.longitude, origin.latitude], distanceMeters, CIRCLE_POINTS)
      .transform('EPSG:4326', 'EPSG:3857'));
    circle.set('question', question);
    features.push(circle);
  }
  return [...features, ...placeFeatures(question)];
}

/** Dashed: what a question divides is only drawn until the hiders answer it. */
export function questionStyle(feature: FeatureLike): Style | Style[] {
  if (feature.get('thermometerPart')) return thermometerStyle(feature);
  if (feature.get('placePart')) return placeStyle(feature);
  const question = feature.get('question') as QuestionDTO;
  return new Style({
    stroke: new Stroke({ color: SEEKER_COLOR, width: 2, lineDash: [8, 6] }),
    fill: new Fill({ color: 'rgba(45, 91, 184, 0.05)' }),
    text: new Text({
      text: mapLabel(question),
      placement: 'line',
      font: '600 12px system-ui, sans-serif',
      fill: new Fill({ color: '#17232b' }),
      stroke: new Stroke({ color: '#ffffff', width: 4 })
    })
  });
}

type PlacePart = 'link' | 'pin';

function placePart(part: PlacePart, geometry: Geometry, question: QuestionDTO, label?: string): Feature<Geometry> {
  const feature = new Feature(geometry);
  feature.set('placePart', part);
  feature.set('question', question);
  feature.set('label', label);
  return feature;
}

/**
 * The places a question is about. Matching: the seekers' nearest place and, until answered, the area where it is
 * the nearest. Measuring: that place and, until answered, everywhere as close to one as the seekers were.
 * Tentacles: the place the hiders named, once answered, if it is on the map.
 */
export function placeFeatures(question: QuestionDTO): Feature<Geometry>[] {
  const { origin, nearest } = question.params;
  const named = question.answer?.position;
  const features: Feature<Geometry>[] = [];
  if (nearest) {
    const place = fromLonLat([nearest.longitude, nearest.latitude]);
    const area = question.type === 'MATCHING' ? nearest.cell : nearest.reach;
    if (area && !question.answer) {
      const feature = new Feature(GEO_JSON.readGeometry(area));
      feature.set('question', question);
      features.push(feature);
    }
    if (origin) {
      const line = new LineString([fromLonLat([origin.longitude, origin.latitude]), place]);
      features.push(placePart('link', line, question, question.type === 'MEASURING' ? formatDistance(nearest.distanceMeters) : undefined));
    }
    features.push(placePart('pin', new Point(place), question, nearest.name ?? 'Unnamed'));
  }
  if (named) features.push(placePart('pin', new Point(fromLonLat([named.longitude, named.latitude])), question, question.answer?.text));
  return features;
}

function placeStyle(feature: FeatureLike): Style {
  const label = new Text({
    text: String(feature.get('label') ?? ''),
    font: '600 12px system-ui, sans-serif',
    fill: new Fill({ color: '#17232b' }),
    stroke: new Stroke({ color: '#ffffff', width: 4 }),
    overflow: true
  });
  if (feature.get('placePart') === 'link') {
    return new Style({ stroke: new Stroke({ color: SEEKER_COLOR, width: 2, lineDash: [1, 6], lineCap: 'round' }), text: label });
  }
  label.setOffsetY(-14);
  return new Style({
    image: new CircleStyle({ radius: 6, fill: new Fill({ color: SEEKER_COLOR }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }),
    text: label
  });
}

type ThermometerPart = 'point' | 'path' | 'divide';

function lonLat(position: Position): [number, number] {
  return [position.longitude, position.latitude];
}

function thermometerPart(part: ThermometerPart, geometry: Geometry, question?: QuestionDTO): Feature<Geometry> {
  const feature = new Feature(geometry);
  feature.set('thermometerPart', part);
  feature.set('question', question);
  return feature;
}

/**
 * A thermometer on the map: the line moved along with its two points and, until answered, the line dividing nearer
 * the start from nearer the end.
 */
export function thermometerFeatures(start: Position, end: Position, question?: QuestionDTO): Feature<Geometry>[] {
  const from = lonLat(start);
  const to = lonLat(end);
  const project = (points: readonly LonLat[]) => points.map(point => fromLonLat([...point]));
  const divide = question?.answer ? null : perpendicularBisector(from, to);
  return [
    ...(divide ? [thermometerPart('divide', new LineString(project(divide)), question)] : []),
    thermometerPart('path', new LineString(project([from, to])), question),
    thermometerPart('point', new Point(fromLonLat(from)), question),
    thermometerPart('point', new Point(fromLonLat(to)), question)
  ];
}

/** Dashed where it divides, as what the other questions divide is. */
export function thermometerStyle(feature: FeatureLike): Style {
  const question = feature.get('question') as QuestionDTO | undefined;
  const color = SEEKER_COLOR;
  switch (feature.get('thermometerPart') as ThermometerPart) {
    case 'divide':
      return new Style({
        stroke: new Stroke({ color, width: 2, lineDash: [8, 6] }),
        text: question && new Text({
          text: mapLabel(question),
          placement: 'line',
          font: '600 12px system-ui, sans-serif',
          fill: new Fill({ color: '#17232b' }),
          stroke: new Stroke({ color: '#ffffff', width: 4 })
        })
      });
    case 'path':
      return new Style({ stroke: new Stroke({ color, width: 3 }) });
    case 'point':
      return new Style({
        image: new CircleStyle({ radius: 6, fill: new Fill({ color }), stroke: new Stroke({ color: '#ffffff', width: 2 }) })
      });
  }
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
