import { inject, Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import type { AgencyRouteEntity } from '../api/generated';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { TransitService } from '../transit/transit.service';
import { BaseLayerService } from './base-layer.service';

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

  protected override createLayers(_map: OlMap) {
    return [new VectorLayer({ source: this.source })];
  }

  public async refreshVehiclePositions(map: OlMap): Promise<void> {
    this.currentPositions = await this.transitService.refreshVehiclePositions();
    this.currentMap = map;
    this.renderVehicles();
  }

  public setRouteMetadata(routes: readonly AgencyRouteEntity[]): void {
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
    const features: Feature<Point>[] = [];

    for (const position of this.currentPositions) {
      const longitude = position.longitude;
      const latitude = position.latitude;
      if (typeof longitude !== 'number' || !Number.isFinite(longitude)
        || typeof latitude !== 'number' || !Number.isFinite(latitude)) continue;

      const routeId = position.routeId || this.routeIdsByTripId.get(position.tripId ?? '') || '';
      const label = this.routeNames.get(routeId) || routeId || position.id || 'Vehicle';
      const highlighted = this.highlightedRouteIds.has(routeId);
      const feature = new Feature<Point>({
        geometry: new Point(fromLonLat([longitude, latitude], projection)),
        routeId,
        tripId: position.tripId ?? '',
        vehicle: position,
        vehicleLabel: label
      });
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
      features.push(feature);
    }

    this.source.clear(true);
    this.source.addFeatures(features);
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