import { Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { Stroke, Style, Text, Fill } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import type { ShapePointDTO } from '../api/generated';
import { BaseLayerService } from './base-layer.service';

@Injectable({ providedIn: 'root' })
export class RouteShapesLayerService extends BaseLayerService {
  private readonly source = new VectorSource<Feature<LineString>>();
  private readonly vehicleRouteSource = new VectorSource<Feature<LineString>>();
  private readonly layer = new VectorLayer({
    source: this.source,
    style: feature => [
      new Style({
        stroke: new Stroke({ color: "#000000", width: 3 })
      }),
      new Style({
        stroke: new Stroke({ color: routeColor(String(feature.get('routeId') ?? '')), width: 2 })
      })
    ]
  });
  private readonly vehicleRouteLayer = new VectorLayer({
    source: this.vehicleRouteSource,
    style: [
      new Style({ stroke: new Stroke({ color: '#17232b', width: 6, lineDash: [4, 8] }) }),
      new Style({ stroke: new Stroke({ color: '#3498db', width: 3, lineDash: [4, 8] }) })
    ]
  });

  protected override createLayers(_map: OlMap) {
    return [this.layer, this.vehicleRouteLayer];
  }

  public setVehicleRouteShape(shapes: readonly ShapePointDTO[] | null): void {
    this.vehicleRouteSource.clear(true);
    if (!shapes) return;

    const coordinates = shapes
      .filter(point => Number.isFinite(point.shapePtLon) && Number.isFinite(point.shapePtLat))
      .sort((left, right) => (left.shapePtSequence ?? 0) - (right.shapePtSequence ?? 0))
      .map(point => fromLonLat([point.shapePtLon!, point.shapePtLat!]));
    if (coordinates.length >= 2) {
      this.vehicleRouteSource.addFeature(new Feature({ geometry: new LineString(coordinates) }));
    }
  }

  /** Draws each route's lines, given as [longitude, latitude] points in order, and fits the view to them. */
  public setRouteShapes(
    map: OlMap,
    linesByRoute: ReadonlyMap<string, readonly (readonly number[])[][]>
  ): void {
    const features: Feature<LineString>[] = [];
    for (const [routeId, lines] of linesByRoute) {
      for (const line of lines) {
        const coordinates = line
          .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
          .map(point => fromLonLat([point[0], point[1]]));
        if (coordinates.length < 2) continue;

        features.push(new Feature({
          geometry: new LineString(coordinates),
          routeId
        }));
      }
    }

    this.source.clear(true);
    this.source.addFeatures(features);
    if (features.length === 0) return;

    const extent = this.source.getExtent();
    if (!extent) return;

    const size = map.getSize();
    map.getView().fit(extent, {
      padding: [56, 56, 56, 56],
      maxZoom: 14,
      duration: 350,
      ...(size ? { size } : {})
    });
  }
}

/** A stable color per route, so a route keeps its color everywhere it is shown. */
export function routeColor(routeId: string): string {
  let hash = 0;
  for (const character of routeId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 72% 42%)`;
}