import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import Feature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

import { ReachabilityControllerService } from '../api/generated';
import type { ReachableStationDTO, StopDTO } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import { formatDuration } from '../shared/format';
import { problemDetail } from '../shared/problem-detail';

export interface ReachabilityQuery {
  stopId: string;
  /** Day to travel, "YYYY-MM-DD"; only trips that run on that day are taken. */
  date: string;
  /** Time of day to leave, "HH:MM". */
  startTime: string;
  durationMinutes: number;
}

/** The longest search the backend allows. */
export const MAX_REACHABILITY_MINUTES = 240;

/** Colors of the markers, also used by the panel's legend. */
export const REACHABILITY_COLORS = {
  likely: '#1b7a3d',
  unlikely: '#c25e00',
  origin: '#172b32'
} as const;

/** Names are shown from this zoom in, so a whole region of markers does not turn into a wall of text. */
const LABEL_MIN_ZOOM = 13;

/**
 * Which stations can be reached from one station within a time, by public transport and on foot, drawn on the map.
 * Likely stations are reached with time to spare at every transfer; unlikely ones only through tight transfers.
 */
@Injectable({ providedIn: 'root' })
export class ReachabilityService {
  private readonly api = inject(ReachabilityControllerService);
  private readonly layerService = inject(LayerService);

  private readonly source = new VectorSource<Feature<Point>>();
  private layer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private labelMaxResolution = 0;

  /** The station to travel from. */
  readonly origin = signal<StopDTO | null>(null);
  /** True while the next click on a stop on the map picks the origin. */
  readonly picking = signal(false);
  /** True to fade the markers back, while something is drawn over them. */
  readonly dimmed = signal(false);
  /** The search shown, or null when there is none. */
  private readonly query = signal<ReachabilityQuery | null>(null);
  /** The search whose result is shown, or null while there is none or it is still loading. */
  readonly shownQuery = computed(() => this.hasResult() ? this.query() : null);

  private readonly result = rxResource({
    params: computed(() => this.query() ?? undefined),
    stream: ({ params }) => this.api.getReachableStations(params.stopId, params.startTime, params.durationMinutes, params.date)
  });

  readonly stations = computed<ReachableStationDTO[]>(() => this.result.hasValue() ? this.result.value() : []);
  readonly likelyCount = computed(() => this.stations().filter(station => station.likely).length);
  readonly unlikelyCount = computed(() => this.stations().length - this.likelyCount());
  readonly loading = this.result.isLoading;
  readonly hasResult = computed(() => this.query() !== null && this.result.hasValue());
  readonly error = computed(() => {
    const error = this.result.error();
    return error === undefined ? null : problemDetail(error) ?? 'The reachable stations could not be calculated.';
  });

  private readonly markerStyles = {
    likely: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: REACHABILITY_COLORS.likely }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      }),
      zIndex: 2
    }),
    // A ring rather than a dot, so the two differ in shape as well as color
    unlikely: new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: REACHABILITY_COLORS.unlikely, width: 3 })
      }),
      zIndex: 1
    }),
    origin: new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: REACHABILITY_COLORS.origin }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }),
      zIndex: 3
    })
  };

  constructor() {
    effect(() => this.draw(this.stations(), this.origin()));
    effect(() => {
      // Read first: before the map is set up there is no layer, and the effect must still follow the signal
      const opacity = this.dimmed() ? 0.35 : 1;
      this.layer?.setOpacity(opacity);
    });
  }

  initialize(map: OlMap): void {
    if (this.labelMaxResolution > 0) return;
    this.labelMaxResolution = map.getView().getResolutionForZoom(LABEL_MIN_ZOOM);
    const layer = new VectorLayer({
      source: this.source,
      style: (feature, resolution) => this.getStyle(feature, resolution),
      opacity: this.dimmed() ? 0.35 : 1
    });
    this.layer = layer;
    layer.setZIndex(940);
    this.layerService.addMeasureLayer(map, layer);
  }

  /** Travels from this stop; an earlier result is cleared, since it was for another station. */
  setOrigin(stop: StopDTO): void {
    this.origin.set(stop);
    this.picking.set(false);
    this.query.set(null);
  }

  /** Uses a clicked stop as the origin if one is being picked; returns whether the click was used for that. */
  pickStop(stop: StopDTO): boolean {
    if (!this.picking()) return false;
    this.setOrigin(stop);
    return true;
  }

  calculate(date: string, startTime: string, durationMinutes: number): void {
    const stopId = this.origin()?.stopId;
    if (!stopId) return;
    this.query.set({ stopId, date, startTime, durationMinutes });
  }

  clear(): void {
    this.origin.set(null);
    this.picking.set(false);
    this.query.set(null);
  }

  private draw(stations: readonly ReachableStationDTO[], origin: StopDTO | null): void {
    this.source.clear(true);
    const features = stations.map(station => {
      const feature = new Feature(new Point(fromLonLat([station.longitude, station.latitude])));
      feature.setProperties({
        reachability: station.likely ? 'likely' : 'unlikely',
        label: `${station.stopName ?? 'Unnamed'} ${formatDuration(station.earliestArrivalSeconds)}`
      });
      return feature;
    });
    if (origin && typeof origin.longitude === 'number' && typeof origin.latitude === 'number') {
      const feature = new Feature(new Point(fromLonLat([origin.longitude, origin.latitude])));
      feature.setProperties({ reachability: 'origin', label: origin.stopName ?? 'Start' });
      features.push(feature);
    }
    this.source.addFeatures(features);
  }

  private getStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
    const kind = feature.get('reachability') as keyof typeof this.markerStyles | undefined;
    if (!kind) return undefined;
    const marker = this.markerStyles[kind];
    if (resolution > this.labelMaxResolution) return marker;
    return [marker, new Style({
      text: new Text({
        text: String(feature.get('label') ?? ''),
        font: '600 12px sans-serif',
        textBaseline: 'bottom',
        offsetY: -10,
        fill: new Fill({ color: kind === 'unlikely' ? '#7a3b00' : '#0f3d20' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }),
      zIndex: 4
    })];
  }
}
