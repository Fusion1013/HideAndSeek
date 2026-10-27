import { computed, effect, inject, Injectable, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import Feature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import { boundingExtent } from 'ol/extent';
import type { Geometry } from 'ol/geom';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

import { ReachabilityControllerService, ReachabilityLegDTO } from '../api/generated';
import type { ReachabilityLegStopDTO, ReachabilityRouteDTO } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import { formatClock } from '../shared/format';
import { problemDetail } from '../shared/problem-detail';
import { ReachabilityService } from './reachability.service';

/** The most stations whose routes the backend gives at once. */
export const MAX_ROUTE_TARGETS = 50;

/**
 * One color per route shown, in the order chosen, so a route on the map can be found in the panel. Dark enough
 * for 3:1 against the map and white.
 */
export const ROUTE_COLORS = ['#1f5fbf', '#a3238e', '#00796b', '#b3261e', '#5b3cc4', '#6b5300', '#0b6e99', '#8c3b00'] as const;

/** Labels at boarding and alighting stops are shown from this zoom in. */
const LABEL_MIN_ZOOM = 12;

/** A route as shown, with its color on the map. */
export interface ShownRoute {
  route: ReachabilityRouteDTO;
  color: string;
}

/**
 * The quickest routes to stations picked from a reachability result, drawn on the map: rides as solid lines
 * along the track (or through the stops passed, where the track is not known), walks as dashed straight lines,
 * and changes as rings.
 */
@Injectable({ providedIn: 'root' })
export class ReachabilityRouteService {
  private readonly api = inject(ReachabilityControllerService);
  private readonly layerService = inject(LayerService);
  private readonly reachability = inject(ReachabilityService);

  private readonly source = new VectorSource<Feature<Geometry>>();
  private map: OlMap | null = null;
  private labelMaxResolution = 0;

  /** The stations to show routes to, in the order picked; cleared for each new search. */
  readonly selected = linkedSignal<unknown, readonly string[]>({
    source: () => this.reachability.shownQuery(),
    computation: () => []
  });

  private readonly result = rxResource({
    params: computed(() => {
      const query = this.reachability.shownQuery();
      const targets = this.selected();
      return query && targets.length > 0 ? { ...query, targets } : undefined;
    }),
    stream: ({ params }) => this.api.getReachabilityRoutes(
      params.stopId, params.startTime, params.durationMinutes, [...params.targets], params.date)
  });

  /** Kept while the next routes load, so the panel and map do not flicker each time one more is picked. */
  private readonly lastRoutes = linkedSignal<ReachabilityRouteDTO[] | undefined, ReachabilityRouteDTO[]>({
    source: () => this.result.hasValue() ? this.result.value() : undefined,
    computation: (routes, previous) => routes ?? previous?.value ?? []
  });

  /** The routes in the order picked, each with its color; only those still picked. */
  readonly routes = computed<ShownRoute[]>(() => {
    const byId = new Map(this.lastRoutes().map(route => [route.stopId, route] as const));
    return this.selected().flatMap((stopId, index) => {
      const route = byId.get(stopId);
      return route ? [{ route, color: ROUTE_COLORS[index % ROUTE_COLORS.length] }] : [];
    });
  });

  readonly loading = this.result.isLoading;
  readonly error = computed(() => {
    const error = this.result.error();
    return error === undefined ? null : problemDetail(error) ?? 'The routes could not be found.';
  });

  /** Seconds after midnight that the search starts, to turn the routes' times into clock times. */
  readonly startSeconds = computed(() => {
    const [hours, minutes] = (this.reachability.shownQuery()?.startTime ?? '0:0').split(':').map(Number);
    return (hours || 0) * 3600 + (minutes || 0) * 60;
  });

  constructor() {
    effect(() => this.draw(this.routes(), this.startSeconds()));
    // The reachable stations fade back while routes are shown, which would otherwise be lost among them
    effect(() => this.reachability.dimmed.set(this.selected().length > 0));
  }

  initialize(map: OlMap): void {
    if (this.map) return;
    this.map = map;
    this.labelMaxResolution = map.getView().getResolutionForZoom(LABEL_MIN_ZOOM);
    const layer = new VectorLayer({
      source: this.source,
      style: (feature, resolution) => this.getStyle(feature, resolution)
    });
    // Above the reachable station markers, so the routes are not hidden among them
    layer.setZIndex(950);
    this.layerService.addMeasureLayer(map, layer);
  }

  setSelected(stopId: string, selected: boolean): void {
    this.selected.update(stopIds => {
      if (!selected) return stopIds.filter(id => id !== stopId);
      if (stopIds.includes(stopId) || stopIds.length >= MAX_ROUTE_TARGETS) return stopIds;
      return [...stopIds, stopId];
    });
  }

  clearSelected(): void {
    this.selected.set([]);
  }

  /** Moves the map to show the whole route. */
  zoomTo(route: ReachabilityRouteDTO): void {
    const view = this.map?.getView();
    const coordinates = route.legs.flatMap(leg => [...leg.stops, ...(leg.path ?? [])].map(coordinate));
    if (!this.map || !view || coordinates.length === 0) return;
    const padding = 60;
    view.fit(boundingExtent(coordinates), {
      padding: [padding, padding + coveredRight(this.map), padding, padding],
      maxZoom: 16,
      duration: 300
    });
  }

  private draw(routes: readonly ShownRoute[], startSeconds: number): void {
    this.source.clear(true);
    const features: Feature<Geometry>[] = [];
    routes.forEach(({ route, color }, order) => {
      // Lines first, so the stops are drawn over them
      for (const leg of route.legs) {
        // Along the track where the trip's shape is known; otherwise straight from stop to stop
        const points = leg.path && leg.path.length > 1 ? leg.path : leg.stops;
        const line = new Feature(new LineString(points.map(coordinate)));
        line.setProperties({ kind: leg.mode === ReachabilityLegDTO.ModeEnum.Walk ? 'walk' : 'ride', color, order });
        features.push(line);
      }
      route.legs.forEach((leg, index) => {
        if (leg.mode !== ReachabilityLegDTO.ModeEnum.Ride) return;
        leg.stops.slice(1, -1).forEach(stop => features.push(stopFeature(stop, 'passed', color, order)));
        const name = leg.routeShortName || leg.routeLongName || 'Ride';
        features.push(stopFeature(leg.stops[0], 'change', color, order,
          `${name} ${formatClock(startSeconds + leg.departureSeconds)}`));
        if (index === route.legs.length - 1 || route.legs[index + 1].mode === ReachabilityLegDTO.ModeEnum.Walk) {
          const last = leg.stops[leg.stops.length - 1];
          features.push(stopFeature(last, 'change', color, order,
            `${formatClock(startSeconds + leg.arrivalSeconds)}`));
        }
      });
      const destination = new Feature(new Point(fromLonLat([route.longitude, route.latitude])));
      destination.setProperties({
        kind: 'destination', color, order,
        label: `${route.stopName ?? 'Destination'} ${formatClock(startSeconds + route.arrivalSeconds)}`
      });
      features.push(destination);
    });
    this.source.addFeatures(features);
  }

  private getStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
    const kind = feature.get('kind') as string | undefined;
    const color = String(feature.get('color') ?? ROUTE_COLORS[0]);
    // Later routes over earlier ones, and in each route, stops over lines
    const order = Number(feature.get('order') ?? 0) * 10;
    switch (kind) {
      case 'ride':
        return [
          new Style({ stroke: new Stroke({ color: '#ffffff', width: 8 }), zIndex: order }),
          new Style({ stroke: new Stroke({ color, width: 5 }), zIndex: order + 1 })
        ];
      case 'walk':
        return [
          new Style({ stroke: new Stroke({ color: '#ffffff', width: 6 }), zIndex: order }),
          new Style({ stroke: new Stroke({ color, width: 3, lineDash: [2, 7], lineCap: 'round' }), zIndex: order + 1 })
        ];
      case 'passed':
        return new Style({
          image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color, width: 2 }) }),
          zIndex: order + 2
        });
      case 'change':
        return this.withLabel(feature, resolution, new Style({
          image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color, width: 3 }) }),
          zIndex: order + 3
        }), color, order);
      case 'destination':
        return this.withLabel(feature, 0, new Style({
          image: new CircleStyle({ radius: 9, fill: new Fill({ color }), stroke: new Stroke({ color: '#ffffff', width: 3 }) }),
          zIndex: order + 4
        }), color, order);
      default:
        return undefined;
    }
  }

  /** The marker with its label, which is left out when zoomed out too far to have room for it. */
  private withLabel(feature: FeatureLike, resolution: number, marker: Style, color: string, order: number): Style | Style[] {
    const label = feature.get('label') as string | undefined;
    if (!label || resolution > this.labelMaxResolution) return marker;
    return [marker, new Style({
      text: new Text({
        text: label,
        font: '600 12px sans-serif',
        textAlign: 'left',
        offsetX: 11,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 4 })
      }),
      zIndex: order + 5
    })];
  }
}

/** How far the controls panel reaches over the map from its right edge, in pixels; none when it is closed or beside it. */
function coveredRight(map: OlMap): number {
  const target = map.getTargetElement();
  const panel = target?.ownerDocument.querySelector('.controls-panel');
  if (!target || !panel) return 0;
  const mapBox = target.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  if (panelBox.width === 0 || panelBox.left >= mapBox.right || panelBox.bottom <= mapBox.top) return 0;
  // On a narrow screen the panel covers the whole width; then there is no side to keep clear
  const covered = mapBox.right - panelBox.left;
  return covered < mapBox.width * 0.7 ? covered : 0;
}

function coordinate(point: { latitude: number; longitude: number }): number[] {
  return fromLonLat([point.longitude, point.latitude]);
}

function stopFeature(stop: ReachabilityLegStopDTO, kind: 'passed' | 'change', color: string, order: number,
                     label?: string): Feature<Point> {
  const feature = new Feature(new Point(coordinate(stop)));
  feature.setProperties({ kind, color, order, label });
  return feature;
}
