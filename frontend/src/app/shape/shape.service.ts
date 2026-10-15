import { inject, Injectable, signal } from '@angular/core';
import Feature from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { Coordinate } from 'ol/coordinate';
import { Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { getDistance, getLength } from 'ol/sphere';
import { toLonLat } from 'ol/proj';
import { LayerService } from '../layer/layer.service';
import { MapService } from '../map/map.service';

export interface ShapeStyleOptions {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class ShapeService {
  private readonly mapService = inject(MapService);
  private readonly layerService = inject(LayerService);
  private readonly source = new VectorSource<Feature<Geometry>>();
  private layer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  private drawLine: Draw | null = null;
  private drawCircle: Draw | null = null;
  private select: Select | null = null;
  private modify: Modify | null = null;
  private translate: Translate | null = null;
  readonly shapeCount = signal(0);
  readonly selectedShapeCount = signal(0);

  public initialize(map = this.mapService.getMap()): void {
    if (!map) {
      throw new Error('Create the map before initializing measurement tools.');
    }
    if (this.layer) return;

    this.layer = new VectorLayer({
      source: this.source,
      style: feature => feature instanceof Feature ? this.getMeasureStyle(feature, map) : undefined
    });
    this.layer.setZIndex(1000);
    this.layerService.addMeasureLayer(map, this.layer);

    this.select = new Select({ layers: [this.layer] });
    const selectedFeatures = this.select.getFeatures();
    map.addInteraction(this.select);
    this.modify = new Modify({ features: selectedFeatures });
    this.translate = new Translate({ features: selectedFeatures });
    map.addInteraction(this.modify);
    map.addInteraction(this.translate);

    this.drawLine = new Draw({ source: this.source, type: 'LineString' });
    this.drawCircle = new Draw({ source: this.source, type: 'Circle' });
    this.drawLine.setActive(false);
    this.drawCircle.setActive(false);
    map.addInteraction(this.drawLine);
    map.addInteraction(this.drawCircle);

    this.source.on('addfeature', () => this.shapeCount.set(this.source.getFeatures().length));
    this.source.on('removefeature', () => this.shapeCount.set(this.source.getFeatures().length));
    this.source.on('clear', () => this.shapeCount.set(0));
    this.select.on('select', () => this.selectedShapeCount.set(selectedFeatures.getLength()));
  }

  public setDrawMode(mode: 'line' | 'circle' | null): void {
    this.drawLine?.setActive(mode === 'line');
    this.drawCircle?.setActive(mode === 'circle');
    this.select?.setActive(mode === null);
    this.modify?.setActive(mode === null);
    this.translate?.setActive(mode === null);
  }

  public removeSelectedShapes(): void {
    const selectedFeatures = this.select?.getFeatures();
    selectedFeatures?.getArray().slice().forEach(feature => this.removeShape(feature));
    selectedFeatures?.clear();
    this.selectedShapeCount.set(0);
  }

  public createCircle(
    center: Coordinate,
    radius: number,
    options: ShapeStyleOptions = {}
  ): Feature<CircleGeometry> {
    this.validateCoordinate(center);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError('Circle radius must be a positive finite number.');
    }

    return this.addShape(new CircleGeometry(center, radius), options, true);
  }

  public createLine(
    coordinates: Coordinate[],
    options: ShapeStyleOptions = {}
  ): Feature<LineString> {
    if (coordinates.length < 2) {
      throw new RangeError('A line requires at least two coordinates.');
    }
    coordinates.forEach(coordinate => this.validateCoordinate(coordinate));

    return this.addShape(new LineString(coordinates), options, false);
  }

  public removeShape(feature: Feature<Geometry>): void {
    this.source.removeFeature(feature);
  }

  public clearShapes(): void {
    this.source.clear();
    this.select?.getFeatures().clear();
    this.selectedShapeCount.set(0);
  }

  public getShapes(): Feature<Geometry>[] {
    return this.source.getFeatures();
  }

  private addShape<T extends Geometry>(
    geometry: T,
    options: ShapeStyleOptions,
    hasFill: boolean
  ): Feature<T> {
    const map = this.mapService.getMap();
    if (!map) {
      throw new Error('Create the map before adding shapes.');
    }

    if (!this.layer) this.initialize(map);

    const strokeWidth = options.strokeWidth ?? 3;
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
      throw new RangeError('Stroke width must be a positive finite number.');
    }

    const fillColor = options.fillColor === undefined
      ? (hasFill ? 'rgba(214, 33, 43, 0.18)' : null)
      : options.fillColor;
    const feature = new Feature(geometry);
    feature.set('strokeColor', options.strokeColor ?? '#d6212b');
    feature.set('strokeWidth', strokeWidth);
    feature.set('fillColor', fillColor);
    this.source.addFeature(feature);
    return feature;
  }

  private getMeasureStyle(feature: Feature<Geometry>, map: OlMap): Style {
    const geometry = feature.getGeometry();
    const measurement = geometry instanceof LineString
      ? this.formatDistance(getLength(geometry, { projection: map.getView().getProjection() }))
      : geometry instanceof CircleGeometry
        ? `R ${this.formatDistance(getDistance(
          toLonLat(geometry.getCenter(), map.getView().getProjection()),
          toLonLat([
            geometry.getCenter()[0] + geometry.getRadius(),
            geometry.getCenter()[1]
          ], map.getView().getProjection())
        ))}`
        : '';

    return new Style({
      stroke: new Stroke({
        color: String(feature.get('strokeColor') ?? '#d6212b'),
        width: Number(feature.get('strokeWidth') ?? 3)
      }),
      ...(feature.get('fillColor') ? { fill: new Fill({ color: String(feature.get('fillColor')) }) } : {}),
      text: new Text({
        text: measurement,
        placement: geometry instanceof LineString ? 'line' : 'point',
        font: '600 13px sans-serif',
        fill: new Fill({ color: '#17232b' }),
        stroke: new Stroke({ color: '#ffffff', width: 4 }),
        padding: [2, 4, 2, 4]
      })
    });
  }

  private formatDistance(distance: number): string {
    return distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`;
  }

  private validateCoordinate(coordinate: Coordinate): void {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      throw new RangeError('Shape coordinates must be finite.');
    }
  }
}