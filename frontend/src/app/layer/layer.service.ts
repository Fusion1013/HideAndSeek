import { inject, Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import TileLayer from 'ol/layer/Tile';
import OlMap from 'ol/Map';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';
import { TransitService } from '../transit/transit.service';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';

interface StationLabelGroup {
  xTotal: number;
  yTotal: number;
  entranceCount: number;
  lines: Set<string>;
}

@Injectable({
  providedIn: 'root',
})
export class LayerService {

  private readonly transitService = inject(TransitService);
  private readonly lineLayers = new Map<string, VectorLayer<VectorSource>>();
  private vehicleSource: VectorSource<Feature<Point>> | null = null;
  private stationLabelLayer: VectorLayer<VectorSource> | null = null;
  private visibleLines = new Set<string>();
  private labelsVisible = true;

  public async loadLayers(map: OlMap): Promise<string[]> {
    this.loadLayerBase(map);
    await this.transitService.loadTransitData(map.getView().getProjection());
    this.loadTransitLayers(map);
    this.loadVehicleLayer(map);
    return [...this.lineLayers.keys()];
  }

  public async refreshVehiclePositions(map: OlMap): Promise<void> {
    console.log('Refreshing vehicle positions...', [map]);
    const positions = await this.transitService.refreshVehiclePositions();
    console.log('Refreshed vehicle positions:', positions);
    const projection = map.getView().getProjection();
    const arrowMaxResolution = map.getView().getResolutionForZoom(15);
    const features: Feature<Point>[] = [];

    for (const position of positions) {
      const longitude = position.longitude;
      const latitude = position.latitude;
      if (typeof longitude !== 'number' || !Number.isFinite(longitude)
        || typeof latitude !== 'number' || !Number.isFinite(latitude)) continue;

      const feature = new Feature<Point>({
        geometry: new Point(fromLonLat([longitude, latitude], projection)),
        routeId: position.routeId ?? '',
        vehicleLabel: position.routeId || position.id || 'Vehicle'
      });
      const vehicleStyles = this.createVehicleStyles(
        feature.get('vehicleLabel'),
        position.bearing,
        position.speedMetersPerSecond
      );
      feature.setStyle((_feature, resolution) =>
        resolution > arrowMaxResolution
          ? vehicleStyles.markerOnly
          : vehicleStyles.hasBearing
            ? vehicleStyles.withArrow
            : vehicleStyles.withoutArrow
      );
      features.push(feature);
    }

    this.vehicleSource?.clear(true);
    this.vehicleSource?.addFeatures(features);
  }

  public setVisibleLines(lines: readonly string[], showLabels: boolean): void {
    const selectedLines = new Set(lines);
    this.visibleLines = selectedLines;
    this.labelsVisible = showLabels;
    this.lineLayers.forEach((layer, line) => layer.setVisible(selectedLines.has(line)));
    this.stationLabelLayer?.changed();
  }

  public addMeasureLayer(map: OlMap, layer: VectorLayer<VectorSource<Feature<Geometry>>>): void {
    map.addLayer(layer);
  }

  private loadLayerBase(map: OlMap) {
    const osmLayer = new TileLayer({
      source: new OSM()
    });
    map.addLayer(osmLayer);
  }

  private loadTransitLayers(map: OlMap): void {
    const lineColors = new Map(
      this.transitService.transitLines().map(lineData => [lineData.line, lineData.color])
    );
    const lines = [...this.transitService.routesByLine.keys()].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true })
    );

    for (const line of lines) {
      const color = lineColors.get(line) ?? '#0059a9';
      const routeStyle = new Style({ stroke: new Stroke({ color, width: 3 }) });
      const stopStyle = new Style({
        image: new CircleStyle({
          radius: 4,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color, width: 2 })
        })
      });
      const source = new VectorSource({
        features: [
          ...(this.transitService.routesByLine.get(line) ?? []),
          ...(this.transitService.stopsByLine.get(line)?.map(stop => stop.feature) ?? [])
        ]
      });
      const layer = new VectorLayer({
        source,
        style: feature => feature.getGeometry()?.getType() === 'Point' ? stopStyle : routeStyle
      });

      this.lineLayers.set(line, layer);
      map.addLayer(layer);
    }

    this.loadStationLabels(map);
  }

  private loadVehicleLayer(map: OlMap): void {
    this.vehicleSource = new VectorSource<Feature<Point>>();
    map.addLayer(new VectorLayer({
      source: this.vehicleSource
    }));
  }

  private createVehicleStyles(label: string, bearing: unknown, speed: unknown): {
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
    const markerOnly = [new Style({
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: '#ed6a35', width: 2 })
      })
    })];
    const withoutArrow = [...markerOnly, new Style({
        text: new Text({
          text: `${label}\n${details}`,
          font: '600 11px sans-serif',
          offsetY: -(arrowSize / 2 + 12),
          fill: new Fill({ color: '#17232b' }),
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
          fill: new Fill({ color: '#ed6a35' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      }), ...withoutArrow]
      : withoutArrow;

    return { hasBearing, markerOnly, withArrow, withoutArrow };
  }

  private loadStationLabels(map: OlMap): void {
    const groups = new Map<string, StationLabelGroup>();

    for (const stop of this.transitService.transitStops()) {
      const name = stop.name.trim();
      const geometry = stop.feature.getGeometry();
      if (!name || !(geometry instanceof Point)) continue;

      const [x, y] = geometry.getCoordinates();
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const group = groups.get(name) ?? {
        xTotal: 0,
        yTotal: 0,
        entranceCount: 0,
        lines: new Set<string>()
      };
      group.xTotal += x;
      group.yTotal += y;
      group.entranceCount += 1;
      stop.lines.split(',').map(line => line.trim()).filter(Boolean).forEach(line => group.lines.add(line));
      groups.set(name, group);
    }

    const labelStyles = new Map<string, Style>();
    const labelFeatures = [...groups].map(([name, group]) => {
      labelStyles.set(name, new Style({
        text: new Text({
          text: name,
          font: '12px sans-serif',
          offsetY: -14,
          fill: new Fill({ color: '#000000' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      }));

      return new Feature({
        geometry: new Point([
          group.xTotal / group.entranceCount,
          group.yTotal / group.entranceCount
        ]),
        name,
        lines: [...group.lines]
      });
    });

    this.stationLabelLayer = new VectorLayer({
      source: new VectorSource({ features: labelFeatures }),
      style: feature => {
        const lines = feature.get('lines');
        if (!this.labelsVisible || !Array.isArray(lines) || !lines.some(line => this.visibleLines.has(line))) {
          return undefined;
        }

        return labelStyles.get(String(feature.get('name') ?? ''));
      }
    });
    map.addLayer(this.stationLabelLayer);
  }

}
