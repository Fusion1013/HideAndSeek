import { computed, effect, inject, Injectable, signal } from '@angular/core';
import Feature, { FeatureLike } from 'ol/Feature';
import { Geometry, LineString, Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import OlMap from 'ol/Map';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { ProjectionLike } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { getDistance } from 'ol/sphere';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

import type { OverpassLocationDTO } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import type { MapLayerId } from '../layer/layer.service';
import { GeolocationService } from '../position/geolocation.service';
import { formatDistance } from '../shared/format';

export type PositionSource = 'mouse' | 'gps';

export interface ClosestLocation {
  layerId: MapLayerId;
  /** The layer's color, used for its line and list entry. */
  color: string;
  /** OSM type and id, unique across layers. */
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  distanceMeters: number;
}

type LonLat = readonly [longitude: number, latitude: number];

/**
 * For each visible measurable layer, finds the place closest to the user's position and draws a line to it.
 * Lines and areas are measured to their nearest point, not to their center.
 */
@Injectable({ providedIn: 'root' })
export class ClosestLocationsService {
  private readonly layerService = inject(LayerService);
  private readonly geolocation = inject(GeolocationService);

  private readonly source = new VectorSource<Feature<Geometry>>();
  private readonly layer = new VectorLayer({
    source: this.source,
    style: feature => this.getStyle(feature),
    zIndex: 960,
    visible: false
  });
  private map: OlMap | null = null;

  private readonly mouseLonLat = signal<LonLat | null>(null);
  /** Bumped when a point layer loads or drops features, so results are recomputed. */
  private readonly featuresVersion = signal(0);

  /** Lines and calculations only run, and are only shown, while this is true. */
  readonly active = signal(false);
  readonly positionSource = signal<PositionSource>('mouse');

  readonly origin = computed<LonLat | null>(() => {
    if (this.positionSource() === 'mouse') return this.mouseLonLat();
    const position = this.geolocation.position();
    return position ? [position.longitude, position.latitude] : null;
  });

  readonly gpsError = this.geolocation.error;

  /** Visible layers that can be measured to, in registry order. */
  readonly openLayerIds = computed(() => {
    const visible = this.layerService.visibleLayerIds();
    return [...this.layerService.getDistanceLayers().keys()].filter(id => visible.has(id));
  });

  /** The closest place on each open layer, nearest first. */
  readonly results = computed<ClosestLocation[]>(() => {
    const origin = this.origin();
    this.featuresVersion();
    if (!this.active() || !origin) return [];

    const layers = this.layerService.getDistanceLayers();
    const projection = this.map?.getView().getProjection() ?? 'EPSG:3857';
    return this.openLayerIds()
      .map(layerId => {
        const layer = layers.get(layerId);
        return findClosest(layerId, layer?.color ?? DEFAULT_LINE_COLOR, layer?.getFeatures() ?? [], origin, projection);
      })
      .filter(result => result !== null)
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
  });

  constructor() {
    effect(onCleanup => {
      if (this.active() && this.positionSource() === 'gps') {
        onCleanup(this.geolocation.track());
      }
    });

    effect(() => {
      const active = this.active();
      this.layer.setVisible(active);
      this.render(active ? this.origin() : null, this.results());
    });
  }

  initialize(map: OlMap): void {
    if (this.map) return;
    this.map = map;
    map.addLayer(this.layer);
    map.on('pointermove', this.handlePointerMove);
    for (const layer of this.layerService.getDistanceLayers().values()) {
      layer.onFeaturesChange(() => this.featuresVersion.update(version => version + 1));
    }
  }

  private readonly handlePointerMove = (event: MapBrowserEvent): void => {
    if (!this.active() || this.positionSource() !== 'mouse' || !this.map) return;
    const [longitude, latitude] = toLonLat(event.coordinate, this.map.getView().getProjection());
    this.mouseLonLat.set([longitude, latitude]);
  };

  private render(origin: LonLat | null, results: readonly ClosestLocation[]): void {
    this.source.clear(true);
    if (!origin || !this.map) return;

    const projection = this.map.getView().getProjection();
    const originCoordinate = fromLonLat([...origin], projection);
    const features: Feature<Geometry>[] = results.map(result => new Feature({
      geometry: new LineString([originCoordinate, fromLonLat([result.longitude, result.latitude], projection)]),
      kind: 'line',
      color: result.color,
      label: formatDistance(result.distanceMeters)
    }));
    features.push(new Feature({ geometry: new Point(originCoordinate), kind: 'origin' }));
    this.source.addFeatures(features);
  }

  private readonly originStyle = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#087e8b' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    zIndex: 2
  });
  private readonly lineStyles = new Map<string, Style>();

  private getStyle(feature: FeatureLike): Style {
    if (feature.get('kind') === 'origin') return this.originStyle;

    const label = String(feature.get('label') ?? '');
    const color = String(feature.get('color') ?? DEFAULT_LINE_COLOR);
    const key = `${color} ${label}`;
    let style = this.lineStyles.get(key);
    if (!style) {
      style = new Style({
        stroke: new Stroke({ color, width: 3, lineDash: [1, 7], lineCap: 'round' }),
        text: new Text({
          text: label,
          font: 'bold 13px sans-serif',
          fill: new Fill({ color: '#172b32' }),
          stroke: new Stroke({ color: '#ffffff', width: 4 }),
          overflow: true
        }),
        zIndex: 1
      });
      this.lineStyles.set(key, style);
    }
    return style;
  }
}

const DEFAULT_LINE_COLOR = '#172b32';

function findClosest(
  layerId: MapLayerId,
  color: string,
  features: readonly Feature<Geometry>[],
  origin: LonLat,
  projection: ProjectionLike
): ClosestLocation | null {
  const originCoordinate = fromLonLat([...origin], projection);
  let closest: ClosestLocation | null = null;
  for (const feature of features) {
    const place = feature.get('place') as OverpassLocationDTO | undefined;
    const target = nearestPoint(feature, place, origin, originCoordinate, projection);
    if (!target) continue;

    const [longitude, latitude] = target;
    const distanceMeters = getDistance([...origin], [longitude, latitude]);
    if (!closest || distanceMeters < closest.distanceMeters) {
      closest = {
        layerId,
        color,
        id: `${place?.osmType}/${place?.osmId}`,
        name: place?.name || 'Unnamed',
        longitude,
        latitude,
        distanceMeters
      };
    }
  }
  return closest;
}

/**
 * The point of the place nearest to the origin. Points use their stored position; lines and areas use
 * the closest point of their shape (found in map units, then measured on the sphere), or the origin itself
 * when it lies inside an area.
 */
function nearestPoint(
  feature: Feature<Geometry>,
  place: OverpassLocationDTO | undefined,
  origin: LonLat,
  originCoordinate: number[],
  projection: ProjectionLike
): LonLat | null {
  const geometry = feature.getGeometry();
  if (geometry && !(geometry instanceof Point)) {
    if (geometry.intersectsCoordinate(originCoordinate)) return origin;
    const [longitude, latitude] = toLonLat(geometry.getClosestPoint(originCoordinate), projection);
    return [longitude, latitude];
  }
  const { longitude, latitude } = place ?? {};
  return typeof longitude === 'number' && typeof latitude === 'number' ? [longitude, latitude] : null;
}
