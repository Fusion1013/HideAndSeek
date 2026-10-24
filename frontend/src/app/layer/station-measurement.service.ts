import { inject, Injectable, signal } from '@angular/core';
import Feature from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import type { Coordinate } from 'ol/coordinate';
import OlMap from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getDistance } from 'ol/sphere';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import type { StopDTO } from '../api/generated';
import { LayerService } from './layer.service';
import { formatDistance } from '../shared/format';

export interface StationMeasurePoint {
  id: number;
  distanceMeters: number;
}

@Injectable({ providedIn: 'root' })
export class StationMeasurementService {
  private readonly layerService = inject(LayerService);
  private readonly source = new VectorSource<Feature<Geometry>>();
  private map: OlMap | null = null;
  private stationCoordinate: Coordinate | null = null;
  private radiusFeature: Feature<CircleGeometry> | null = null;
  private nextPointId = 1;

  readonly selectedStop = signal<StopDTO | null>(null);
  readonly radiusMeters = signal(250);
  readonly measurePoints = signal<StationMeasurePoint[]>([]);

  initialize(map: OlMap): void {
    if (this.map) return;
    this.map = map;
    const layer = new VectorLayer({
      source: this.source,
      style: feature => feature instanceof Feature ? this.getFeatureStyle(feature) : undefined
    });
    layer.setZIndex(950);
    this.layerService.addMeasureLayer(map, layer);
  }

  selectStop(stop: StopDTO): void {
    if (!this.map || !hasStopCoordinates(stop)) return;

    this.source.clear();
    this.measurePoints.set([]);
    this.selectedStop.set(stop);
    this.stationCoordinate = fromLonLat([stop.longitude, stop.latitude], this.map.getView().getProjection());
    this.radiusFeature = new Feature(new CircleGeometry(this.stationCoordinate, 1));
    this.radiusFeature.set('stationOverlayType', 'radius');
    this.source.addFeature(this.radiusFeature);
    this.updateRadiusGeometry();
  }

  clearSelectedStop(): void {
    this.selectedStop.set(null);
    this.stationCoordinate = null;
    this.radiusFeature = null;
    this.measurePoints.set([]);
    this.source.clear();
  }

  setRadiusMeters(radius: number): boolean {
    if (!Number.isFinite(radius) || radius < 1 || radius > 10000) return false;
    this.radiusMeters.set(Math.round(radius));
    this.updateRadiusGeometry();
    return true;
  }

  addMeasurePoint(coordinate: Coordinate): StationMeasurePoint | null {
    if (!this.map || !this.stationCoordinate || !isCoordinate(coordinate[0], coordinate[1])) return null;

    const projection = this.map.getView().getProjection();
    const distanceMeters = getDistance(
      toLonLat(this.stationCoordinate, projection),
      toLonLat(coordinate, projection)
    );
    const point: StationMeasurePoint = { id: this.nextPointId++, distanceMeters };
    const lineFeature = new Feature(new LineString([this.stationCoordinate, coordinate]));
    lineFeature.setProperties({ stationOverlayType: 'measure-line', distanceMeters, measurePointId: point.id });
    const pointFeature = new Feature(new Point(coordinate));
    pointFeature.setProperties({ stationOverlayType: 'measure-point', measurePointId: point.id });
    this.source.addFeatures([lineFeature, pointFeature]);
    this.measurePoints.update(points => [...points, point]);
    return point;
  }

  removeMeasurePoint(id: number): void {
    this.source.getFeatures()
      .filter(feature => feature.get('measurePointId') === id)
      .forEach(feature => this.source.removeFeature(feature));
    this.measurePoints.update(points => points.filter(point => point.id !== id));
  }

  private updateRadiusGeometry(): void {
    if (!this.radiusFeature || !this.stationCoordinate) return;
    const latitude = this.selectedStop()?.latitude ?? 0;
    const projectionCorrection = 1 / Math.max(Math.cos(latitude * Math.PI / 180), 0.01);
    this.radiusFeature.setGeometry(new CircleGeometry(
      this.stationCoordinate,
      this.radiusMeters() * projectionCorrection
    ));
    this.radiusFeature.set('radiusMeters', this.radiusMeters());
  }

  private getFeatureStyle(feature: Feature<Geometry>): Style | undefined {
    const kind = feature.get('stationOverlayType');
    if (kind === 'radius') {
      return new Style({
        stroke: new Stroke({ color: '#087e8b', width: 2 }),
        fill: new Fill({ color: 'rgba(8, 126, 139, 0.12)' }),
        text: new Text({
          text: `Radius ${this.radiusMeters()} m`,
          font: '600 12px sans-serif',
          fill: new Fill({ color: '#075761' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      });
    }
    if (kind === 'measure-line') {
      return new Style({
        stroke: new Stroke({ color: '#c24b2c', width: 2, lineDash: [6, 4] }),
        text: new Text({
          text: formatDistance(Number(feature.get('distanceMeters'))),
          placement: 'line',
          font: '600 12px sans-serif',
          fill: new Fill({ color: '#7e301e' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      });
    }
    if (kind === 'measure-point') {
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: '#c24b2c' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 })
        })
      });
    }
    return undefined;
  }
}

function hasStopCoordinates(stop: StopDTO): stop is StopDTO & { longitude: number; latitude: number } {
  return typeof stop.longitude === 'number' && Number.isFinite(stop.longitude)
    && typeof stop.latitude === 'number' && Number.isFinite(stop.latitude);
}

function isCoordinate(longitude: number, latitude: number): boolean {
  return Number.isFinite(longitude) && Number.isFinite(latitude);
}
