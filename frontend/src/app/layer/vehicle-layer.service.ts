import { inject, Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import type { Coordinate } from 'ol/coordinate';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import type { AgencyRouteDTO } from '../api/generated';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { TransitService } from '../transit/transit.service';
import { BaseLayerService } from './base-layer.service';
import { vehicleKey } from '../vehicle/vehicle-position';

/** How long a marker takes to glide to its new position after an update. */
export const MOVE_DURATION_MS = 10_000;

/** Moves longer than this (in map units, about meters) are jumps, e.g. a vehicle starting elsewhere: no glide. */
const MAX_ANIMATED_MOVE = 3000;

interface MarkerMove {
  feature: Feature<Point>;
  from: Coordinate;
  to: Coordinate;
}

@Injectable({ providedIn: 'root' })
export class VehicleLayerService extends BaseLayerService {
  private readonly transitService = inject(TransitService);
  private readonly source = new VectorSource<Feature<Point>>();
  private readonly vehicleColor = '#ed6a35';
  private readonly labelColor = '#17232b';
  private readonly arrowZoom = 15;
  private readonly routeNames = new Map<string, string>();
  private routeIdsByTripId = new Map<string, string>();
  private highlightedRouteIds = new Set<string>();
  private currentPositions: VehiclePosition[] = [];
  private currentMap: OlMap | null = null;

  /** One marker per vehicle, kept between updates so it can move instead of being redrawn. */
  private readonly markers = new Map<string, Feature<Point>>();
  /** Where each marker is heading; a re-render with the same target leaves a running move alone. */
  private readonly targets = new Map<string, Coordinate>();
  private moves: MarkerMove[] = [];
  private moveStart = 0;
  private animationFrame: number | null = null;

  protected override createLayers(_map: OlMap) {
    return [new VectorLayer({ source: this.source })];
  }

  public async refreshVehiclePositions(map: OlMap): Promise<void> {
    this.currentPositions = await this.transitService.refreshVehiclePositions();
    this.currentMap = map;
    this.renderVehicles();
  }

  public setRouteMetadata(routes: readonly AgencyRouteDTO[]): void {
    this.routeNames.clear();
    for (const route of routes) {
      if (!route.routeId) continue;
      this.routeNames.set(route.routeId, route.routeShortName || route.routeLongName || route.routeId);
    }
    this.renderVehicles();
  }

  public setTripRouteIds(routeIdsByTripId: ReadonlyMap<string, string>): void {
    this.routeIdsByTripId = new Map(routeIdsByTripId);
    this.renderVehicles();
  }

  public setHighlightedRouteIds(routeIds: readonly string[]): void {
    this.highlightedRouteIds = new Set(routeIds);
    this.renderVehicles();
  }

  private renderVehicles(): void {
    const map = this.currentMap;
    if (!map) return;

    const projection = map.getView().getProjection();
    const arrowMaxResolution = map.getView().getResolutionForZoom(this.arrowZoom);
    const seen = new Set<string>();
    const added: Feature<Point>[] = [];
    const moves: MarkerMove[] = [];

    for (const position of this.currentPositions) {
      const longitude = position.longitude;
      const latitude = position.latitude;
      if (typeof longitude !== 'number' || !Number.isFinite(longitude)
        || typeof latitude !== 'number' || !Number.isFinite(latitude)) continue;

      const key = vehicleKey(position);
      if (seen.has(key)) continue;
      seen.add(key);

      const routeId = position.routeId || this.routeIdsByTripId.get(position.tripId ?? '') || '';
      const label = this.routeNames.get(routeId) || routeId || position.id || 'Vehicle';
      const highlighted = this.highlightedRouteIds.has(routeId);
      const target = fromLonLat([longitude, latitude], projection);

      let feature = this.markers.get(key);
      if (!feature) {
        feature = new Feature<Point>({ geometry: new Point(target) });
        feature.setId(key);
        this.markers.set(key, feature);
        added.push(feature);
      } else {
        const previousTarget = this.targets.get(key);
        if (!previousTarget || previousTarget[0] !== target[0] || previousTarget[1] !== target[1]) {
          moves.push({ feature, from: feature.getGeometry()!.getCoordinates(), to: target });
        }
      }
      this.targets.set(key, target);

      feature.setProperties({ routeId, tripId: position.tripId ?? '', vehicle: position, vehicleLabel: label });
      const vehicleStyles = this.createVehicleStyles(
        label,
        position.bearing,
        position.speedMetersPerSecond,
        highlighted
      );
      feature.setStyle((_renderedFeature, resolution) =>
        resolution > arrowMaxResolution
          ? vehicleStyles.markerOnly
          : vehicleStyles.hasBearing
            ? vehicleStyles.withArrow
            : vehicleStyles.withoutArrow
      );
    }

    // Vehicles no longer in the feed
    for (const [key, feature] of this.markers) {
      if (seen.has(key)) continue;
      this.source.removeFeature(feature);
      this.markers.delete(key);
      this.targets.delete(key);
    }
    this.source.addFeatures(added);

    if (moves.length > 0) this.startMoves(moves);
  }

  /** Glides markers to their new positions, or puts them there at once when motion is unwanted. */
  private startMoves(moves: MarkerMove[]): void {
    const unfinished = this.moves.filter(move => !moves.some(next => next.feature === move.feature));
    const animate = !prefersReducedMotion() && !(typeof document !== 'undefined' && document.hidden);
    const glides: MarkerMove[] = [];
    for (const move of moves) {
      if (animate && Math.hypot(move.to[0] - move.from[0], move.to[1] - move.from[1]) <= MAX_ANIMATED_MOVE) {
        glides.push(move);
      } else {
        move.feature.getGeometry()!.setCoordinates(move.to);
      }
    }
    // Moves still running from the previous update finish where they were heading
    unfinished.forEach(move => move.feature.getGeometry()!.setCoordinates(move.to));

    this.moves = glides;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (glides.length === 0) return;

    this.moveStart = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - this.moveStart) / MOVE_DURATION_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // ease in-out
      for (const move of this.moves) {
        move.feature.getGeometry()!.setCoordinates([
          move.from[0] + (move.to[0] - move.from[0]) * eased,
          move.from[1] + (move.to[1] - move.from[1]) * eased
        ]);
      }
      this.animationFrame = t < 1 ? requestAnimationFrame(step) : null;
      if (t >= 1) this.moves = [];
    };
    this.animationFrame = requestAnimationFrame(step);
  }

  private createVehicleStyles(label: string, bearing: unknown, speed: unknown, highlighted: boolean): {
    hasBearing: boolean;
    markerOnly: Style[];
    withArrow: Style[];
    withoutArrow: Style[];
  } {
    const hasBearing = typeof bearing === 'number' && Number.isFinite(bearing);
    const hasSpeed = typeof speed === 'number' && Number.isFinite(speed) && speed >= 0;
    const speedValue = hasSpeed ? speed : null;
    const arrowSize = speedValue === null ? 14 : Math.min(46, 14 + speedValue * 1.8);
    const details = [
      hasBearing ? `Bearing ${bearing.toFixed(0)}\u00b0` : 'Bearing n/a',
      speedValue === null ? 'Speed n/a' : `Speed ${speedValue.toFixed(1)} m/s`
    ].join(' | ');
    const markerStyle = new Style({
      image: new CircleStyle({
        radius: highlighted ? 8 : 4,
        fill: new Fill({ color: highlighted ? '#ffd166' : '#ffffff' }),
        stroke: new Stroke({ color: highlighted ? '#a83f1c' : this.vehicleColor, width: highlighted ? 3 : 2 })
      })
    });
    const withoutArrow = [markerStyle, new Style({
      text: new Text({
        text: `${label}\n${details}`,
        font: highlighted ? '700 12px sans-serif' : '600 11px sans-serif',
        offsetY: -(arrowSize / 2 + 12),
        fill: new Fill({ color: this.labelColor }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      })
    })];

    const withArrow = hasBearing
      ? [new Style({
        text: new Text({
          text: '\u2191',
          font: `700 ${arrowSize}px sans-serif`,
          textAlign: 'center',
          textBaseline: 'bottom',
          rotation: ((bearing % 360 + 360) % 360) * Math.PI / 180,
          rotateWithView: true,
          fill: new Fill({ color: highlighted ? '#a83f1c' : this.vehicleColor }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      }), ...withoutArrow]
      : withoutArrow;

    return {
      hasBearing,
      markerOnly: [markerStyle],
      withArrow,
      withoutArrow
    };
  }
}
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
