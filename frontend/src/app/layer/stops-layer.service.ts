import { inject, Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { StopControllerService, StopEntity } from '../api/generated';
import { BaseLayerService } from './base-layer.service';

@Injectable({ providedIn: 'root' })
export class StopsLayerService extends BaseLayerService {
  private readonly stopService = inject(StopControllerService);
  private readonly source = new VectorSource<Feature<Point>>();
  private stops: StopEntity[] = [];
  private visibleStopIds: Set<string> | null = null;
  private readonly stopColor = '#0059a9';
  private readonly markerStyle = new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: this.stopColor, width: 2 })
    })
  });
  private readonly labelStyles = new Map<string, Style>();
  private labelMaxResolution = 0;

  protected override createLayers(map: OlMap) {
    this.labelMaxResolution = map.getView().getResolutionForZoom(15);
    this.stopService.getStops().subscribe(stops => {
      this.stops = stops;
      this.refreshVisibleStops();
    });

    return [new VectorLayer({ source: this.source })];
  }

  public setVisibleStopIds(stopIds: readonly string[] | null): void {
    this.visibleStopIds = stopIds === null ? null : new Set(stopIds);
    this.refreshVisibleStops();
  }

  private refreshVisibleStops(): void {
    this.source.clear(true);
    const visibleStops = this.visibleStopIds === null
      ? this.stops
      : this.stops.filter(stop => stop.stopId && this.visibleStopIds?.has(stop.stopId));
    this.source.addFeatures(visibleStops.map(stop => this.createStopFeature(stop)));
  }

  private createStopFeature(stop: StopEntity): Feature<Point> {
    const feature = new Feature({
      geometry: new Point(fromLonLat([stop.longitude || 0, stop.latitude || 0])),
      stopId: stop.stopId,
      stop,
      name: stop.platformCode ? stop.stopName + ' - ' + stop.platformCode : stop.stopName,
      stopCode: stop.stopCode,
      locationType: stop.locationType,
      parentStation: stop.parentStation
    });
    feature.setId(stop.stopId);
    feature.setStyle((_renderedFeature, resolution) =>
      this.getStopStyle(resolution, feature)
    );
    return feature;
  }

  private getStopStyle(resolution: number, feature: Feature<Point>): Style[] {
    if (resolution > this.labelMaxResolution) return [this.markerStyle];

    const label = String(feature.get('name') || '');
    let labelStyle = this.labelStyles.get(label);
    if (!labelStyle) {
      labelStyle = new Style({
        text: new Text({
          text: label,
          font: '700 14px sans-serif',
          textAlign: 'center',
          textBaseline: 'bottom',
          offsetY: -12,
          fill: new Fill({ color: '#17232b' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      });
      this.labelStyles.set(label, labelStyle);
    }
    return [this.markerStyle, labelStyle];
  }
}