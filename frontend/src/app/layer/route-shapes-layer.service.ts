import { Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { Stroke, Style, Text, Fill } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import type { ShapeEntity } from '../api/generated';

@Injectable({ providedIn: 'root' })
export class RouteShapesLayerService {
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

  public load(map: OlMap): VectorLayer<VectorSource<Feature<LineString>>>[] {
    map.addLayer(this.layer);
    map.addLayer(this.vehicleRouteLayer);
    return [this.layer, this.vehicleRouteLayer];
  }

  public setVehicleRouteShape(shapes: readonly ShapeEntity[] | null): void {
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

  public setRouteShapes(
    map: OlMap,
    shapesByRoute: ReadonlyMap<string, readonly ShapeEntity[][]>
  ): void {
    const features: Feature<LineString>[] = [];
    for (const [routeId, shapes] of shapesByRoute) {
      for (const shape of shapes) {
        const coordinates = shape
          .filter(point => Number.isFinite(point.shapePtLon) && Number.isFinite(point.shapePtLat))
          .sort((left, right) => (left.shapePtSequence ?? 0) - (right.shapePtSequence ?? 0))
          .map(point => fromLonLat([point.shapePtLon!, point.shapePtLat!]));
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

function routeColor(routeId: string): string {
  let hash = 0;
  for (const character of routeId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 72% 42%)`;
}