import { computed, inject, Injectable, signal } from '@angular/core';
import Feature, { type FeatureLike } from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { Coordinate } from 'ol/coordinate';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { getDistance, getLength } from 'ol/sphere';
import { fromLonLat, ProjectionLike, toLonLat } from 'ol/proj';
import { getUid } from 'ol/util';
import { LayerService } from '../layer/layer.service';
import { MapService } from '../map/map.service';
import { LonLat, perpendicularBisector } from '../shared/bisector';
import { formatDistance } from '../shared/format';

export interface ShapeStyleOptions {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string | null;
}

export type DrawMode = 'line' | 'circle' | 'thermometer' | null;
export type ShapeKind = Exclude<DrawMode, null>;

/** A point that places a shape: a circle's center, or a point of a line. */
export interface ShapePoint {
  label: string;
  longitude: number;
  latitude: number;
}

/** A shape on the map as the Measure tab and the shape menu show it. */
export interface ShapeSummary {
  id: string;
  feature: Feature<Geometry>;
  kind: ShapeKind;
  /** "Circle 2": the second circle, in the order they were drawn. */
  label: string;
  measurement: string;
  /** The radius or length on the ground, in meters; null for a line of several segments, which has no one size to set. */
  sizeMeters: number | null;
  points: ShapePoint[];
  strokeColor: string;
  strokeWidth: number;
  filled: boolean;
}

const DEFAULT_COLOR = '#d6212b';
/** As far north and south as the map goes. */
export const MAX_LATITUDE = 85.05;
/** Rounds of scaling a shape to the size asked for. */
const SIZE_STEPS = 4;
const KIND_LABELS: Readonly<Record<ShapeKind, string>> = { line: 'Line', circle: 'Circle', thermometer: 'Thermometer' };
/** The point being placed, under the pointer. */
const SKETCH_POINT_STYLE = new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: DEFAULT_COLOR }), stroke: new Stroke({ color: '#ffffff', width: 2 }) })
});

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
  private drawThermometer: Draw | null = null;
  private select: Select | null = null;
  private modify: Modify | null = null;
  private translate: Translate | null = null;
  readonly shapeCount = signal(0);
  readonly selectedShapeCount = signal(0);
  /** Moves on whenever a shape is added, removed or changed, for what is worked out from the shapes. */
  private readonly revision = signal(0);
  private readonly selectedFeatures = signal<readonly Feature<Geometry>[]>([]);
  /** The shapes, in the order they were drawn. */
  readonly shapes = computed(() => {
    this.revision();
    const features = this.source.getFeatures();
    if (features.length === 0) return [];
    const projection = this.mapService.getMap()?.getView().getProjection();
    const numbers = new Map<ShapeKind, number>();
    return features
      .sort((left, right) => Number(getUid(left)) - Number(getUid(right)))
      .map(feature => {
        const kind = shapeKind(feature);
        numbers.set(kind, (numbers.get(kind) ?? 0) + 1);
        return this.summarize(feature, kind, numbers.get(kind)!, projection);
      });
  });
  /** The shape being adjusted: one selected on its own. */
  readonly selectedShape = computed(() => {
    const selected = this.selectedFeatures();
    return selected.length === 1 ? this.shapes().find(shape => shape.feature === selected[0]) ?? null : null;
  });
  /** The shape being drawn on click, or null when clicks select and move shapes. */
  readonly drawMode = signal<DrawMode>(null);

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

    // Shapes keep their own style when selected, with their measurement, and getMeasureStyle marks them
    this.select = new Select({ layers: [this.layer], style: null, hitTolerance: 8 });
    const selectedFeatures = this.select.getFeatures();
    map.addInteraction(this.select);
    this.modify = new Modify({ features: selectedFeatures });
    // Dragging a thermometer's line anywhere but its ends adds a vertex; it stays a line between its two points
    this.modify.on('modifyend', event => event.features.forEach(feature => {
      const geometry = feature.getGeometry();
      if (feature.get('thermometer') && geometry instanceof LineString && geometry.getCoordinates().length > 2) {
        geometry.setCoordinates([geometry.getFirstCoordinate(), geometry.getLastCoordinate()]);
      }
    }));
    this.translate = new Translate({ features: selectedFeatures });
    map.addInteraction(this.modify);
    map.addInteraction(this.translate);

    const style = (feature: FeatureLike) => this.getSketchStyle(feature, map);
    this.drawLine = new Draw({ source: this.source, type: 'LineString', style });
    this.drawCircle = new Draw({ source: this.source, type: 'Circle', style });
    this.drawThermometer = new Draw({
      source: this.source,
      type: 'LineString',
      maxPoints: 2,
      style: feature => this.getSketchStyle(feature, map, true)
    });
    this.drawThermometer.on('drawend', event => event.feature.set('thermometer', true));
    this.drawLine.setActive(false);
    this.drawCircle.setActive(false);
    this.drawThermometer.setActive(false);
    map.addInteraction(this.drawLine);
    map.addInteraction(this.drawCircle);
    map.addInteraction(this.drawThermometer);

    this.source.on('addfeature', () => this.shapesChanged());
    this.source.on('removefeature', () => this.shapesChanged());
    this.source.on('changefeature', () => this.shapesChanged());
    this.source.on('clear', () => this.shapesChanged());
    this.select.on('select', () => this.selectionChanged());
  }

  public setDrawMode(mode: DrawMode): void {
    // The drawing tools are made with the shapes layer, the first time either is needed
    const map = this.mapService.getMap();
    if (!this.layer && map) this.initialize(map);
    this.drawMode.set(mode);
    this.drawLine?.setActive(mode === 'line');
    this.drawCircle?.setActive(mode === 'circle');
    this.drawThermometer?.setActive(mode === 'thermometer');
    this.select?.setActive(mode === null);
    this.modify?.setActive(mode === null);
    this.translate?.setActive(mode === null);
  }

  public removeSelectedShapes(): void {
    const selectedFeatures = this.select?.getFeatures();
    selectedFeatures?.getArray().slice().forEach(feature => this.removeShape(feature));
    selectedFeatures?.clear();
    this.selectionChanged();
  }

  /** Selects this shape alone, leaving any drawing tool as shapes can only be adjusted without one; null selects none. */
  public selectShape(feature: Feature<Geometry> | null): void {
    if (feature && this.drawMode()) this.setDrawMode(null);
    const selected = this.select?.getFeatures();
    selected?.clear();
    if (feature) selected?.push(feature);
    this.selectionChanged();
  }

  /** Sets a circle's radius or a straight line's length on the ground, keeping its center or start in place. */
  public setShapeSize(feature: Feature<Geometry>, meters: number): boolean {
    const projection = this.mapService.getMap()?.getView().getProjection();
    const size = this.shapes().find(shape => shape.feature === feature)?.sizeMeters;
    const geometry = feature.getGeometry();
    if (!projection || !size || !geometry || !Number.isFinite(meters) || meters <= 0) return false;

    this.resize(geometry, meters, projection);
    return true;
  }

  /** Moves a circle's center, keeping its radius on the ground, or one point of a line. */
  public moveShapePoint(feature: Feature<Geometry>, index: number, longitude: number, latitude: number): boolean {
    const projection = this.mapService.getMap()?.getView().getProjection();
    const geometry = feature.getGeometry();
    if (!projection || !Number.isFinite(longitude) || !Number.isFinite(latitude)
      || Math.abs(longitude) > 180 || Math.abs(latitude) > MAX_LATITUDE) return false;

    const coordinate = fromLonLat([longitude, latitude], projection);
    if (geometry instanceof CircleGeometry) {
      const meters = this.getMeasureMeters(geometry, projection);
      geometry.setCenter(coordinate);
      this.resize(geometry, meters, projection);
      return true;
    }
    if (!(geometry instanceof LineString)) return false;
    const coordinates = geometry.getCoordinates();
    if (index < 0 || index >= coordinates.length) return false;
    coordinates[index] = coordinate;
    geometry.setCoordinates(coordinates);
    return true;
  }

  public restyleShape(
    feature: Feature<Geometry>,
    changes: { strokeColor?: string; strokeWidth?: number; filled?: boolean }
  ): void {
    const strokeColor = changes.strokeColor ?? String(feature.get('strokeColor') ?? DEFAULT_COLOR);
    const filled = changes.filled ?? !!feature.get('fillColor');
    if (changes.strokeWidth !== undefined) feature.set('strokeWidth', changes.strokeWidth);
    feature.set('strokeColor', strokeColor);
    feature.set('fillColor', filled ? translucent(strokeColor) : null);
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

  /** A line between two points, and the line dividing the map into the side nearer to each. */
  public createThermometer(
    start: Coordinate,
    end: Coordinate,
    options: ShapeStyleOptions = {}
  ): Feature<LineString> {
    const feature = this.createLine([start, end], options);
    feature.set('thermometer', true);
    return feature;
  }

  public removeShape(feature: Feature<Geometry>): void {
    this.source.removeFeature(feature);
    this.select?.getFeatures().remove(feature);
    this.selectionChanged();
  }

  public clearShapes(): void {
    this.source.clear();
    this.select?.getFeatures().clear();
    this.selectionChanged();
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
    feature.set('strokeColor', options.strokeColor ?? DEFAULT_COLOR);
    feature.set('strokeWidth', strokeWidth);
    feature.set('fillColor', fillColor);
    this.source.addFeature(feature);
    return feature;
  }

  /** Sizes on the map and on the ground differ by latitude, so scaling only gets close the first time. */
  private resize(geometry: Geometry, meters: number, projection: ProjectionLike): void {
    for (let step = 0; step < SIZE_STEPS; step++) {
      this.scaleShape(geometry, meters / this.getMeasureMeters(geometry, projection));
    }
  }

  private scaleShape(geometry: Geometry, factor: number): void {
    if (geometry instanceof CircleGeometry) {
      geometry.setRadius(geometry.getRadius() * factor);
    } else if (geometry instanceof LineString) {
      const [start, end] = geometry.getCoordinates();
      geometry.setCoordinates([start, [
        start[0] + (end[0] - start[0]) * factor,
        start[1] + (end[1] - start[1]) * factor
      ]]);
    }
  }

  private shapesChanged(): void {
    this.shapeCount.set(this.source.getFeatures().length);
    this.revision.update(revision => revision + 1);
  }

  private selectionChanged(): void {
    const selected = this.select?.getFeatures().getArray().slice() ?? [];
    this.selectedFeatures.set(selected);
    this.selectedShapeCount.set(selected.length);
    this.layer?.changed();
  }

  private summarize(
    feature: Feature<Geometry>,
    kind: ShapeKind,
    number: number,
    projection: ProjectionLike
  ): ShapeSummary {
    const geometry = feature.getGeometry();
    const meters = geometry ? this.getMeasureMeters(geometry, projection) : 0;
    const resizable = geometry instanceof CircleGeometry
      || geometry instanceof LineString && geometry.getCoordinates().length === 2;
    return {
      id: getUid(feature),
      feature,
      kind,
      label: `${KIND_LABELS[kind]} ${number}`,
      measurement: geometry ? this.getMeasurementText(geometry, projection) : '',
      sizeMeters: resizable ? meters : null,
      points: geometry ? this.getShapePoints(geometry, projection) : [],
      strokeColor: String(feature.get('strokeColor') ?? DEFAULT_COLOR),
      strokeWidth: Number(feature.get('strokeWidth') ?? 3),
      filled: !!feature.get('fillColor')
    };
  }

  private getShapePoints(geometry: Geometry, projection: ProjectionLike): ShapePoint[] {
    const coordinates = geometry instanceof CircleGeometry ? [geometry.getCenter()]
      : geometry instanceof LineString ? geometry.getCoordinates()
        : [];
    return coordinates.map((coordinate, index) => {
      const [longitude, latitude] = toLonLat(coordinate, projection);
      const label = geometry instanceof CircleGeometry ? 'Center'
        : coordinates.length === 2 ? (index === 0 ? 'Start' : 'End')
          : `Point ${index + 1}`;
      return { label, longitude, latitude };
    });
  }

  private getMeasureMeters(geometry: Geometry, projection: ProjectionLike): number {
    if (geometry instanceof LineString) return getLength(geometry, { projection });
    if (!(geometry instanceof CircleGeometry)) return 0;
    return getDistance(
      toLonLat(geometry.getCenter(), projection),
      toLonLat([geometry.getCenter()[0] + geometry.getRadius(), geometry.getCenter()[1]], projection)
    );
  }

  private getMeasurementText(geometry: Geometry, projection: ProjectionLike): string {
    const distance = formatDistance(this.getMeasureMeters(geometry, projection));
    return geometry instanceof LineString ? distance : geometry instanceof CircleGeometry ? `R ${distance}` : '';
  }

  /** A shape being drawn, measured as the pointer moves. */
  private getSketchStyle(feature: FeatureLike, map: OlMap, thermometer = false): Style | Style[] | undefined {
    if (!(feature instanceof Feature)) return undefined;
    return feature.getGeometry() instanceof Point ? SKETCH_POINT_STYLE : this.getMeasureStyle(feature, map, thermometer);
  }

  private getMeasureStyle(
    feature: Feature<Geometry>,
    map: OlMap,
    thermometer = !!feature.get('thermometer')
  ): Style | Style[] {
    const geometry = feature.getGeometry();
    const projection = map.getView().getProjection();
    const measurement = geometry ? this.getMeasurementText(geometry, projection) : '';
    const strokeColor = String(feature.get('strokeColor') ?? DEFAULT_COLOR);
    const strokeWidth = Number(feature.get('strokeWidth') ?? 3);

    const style = new Style({
      stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
      ...(feature.get('fillColor') ? { fill: new Fill({ color: String(feature.get('fillColor')) }) } : {}),
      text: new Text({
        text: measurement,
        placement: geometry instanceof LineString ? 'line' : 'point',
        // Also while the line is still shorter than its label
        overflow: true,
        font: '600 13px sans-serif',
        fill: new Fill({ color: '#17232b' }),
        stroke: new Stroke({ color: '#ffffff', width: 4 }),
        padding: [2, 4, 2, 4]
      })
    });
    const divide = thermometer && geometry instanceof LineString ? this.getDividingLine(geometry, projection) : null;
    const styles = [
      ...(this.selectedFeatures().includes(feature)
        ? [new Style({ stroke: new Stroke({ color: '#ffffff', width: strokeWidth + 6 }) })]
        : []),
      style,
      ...(divide
        ? [new Style({ geometry: divide, stroke: new Stroke({ color: strokeColor, width: strokeWidth, lineDash: [10, 8] }) })]
        : [])
    ];
    return styles.length === 1 ? style : styles;
  }

  /** Worked out on the sphere, as a line that is square on the map drifts off the true divide with distance. */
  private getDividingLine(line: LineString, projection: ProjectionLike): LineString | null {
    const [start, end] = [line.getFirstCoordinate(), line.getLastCoordinate()]
      .map(coordinate => toLonLat(coordinate, projection) as unknown as LonLat);
    const bisector = perpendicularBisector(start, end);
    return bisector && new LineString(bisector.map(point => fromLonLat([...point], projection)));
  }

  private validateCoordinate(coordinate: Coordinate): void {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      throw new RangeError('Shape coordinates must be finite.');
    }
  }
}

function shapeKind(feature: Feature<Geometry>): ShapeKind {
  if (feature.getGeometry() instanceof CircleGeometry) return 'circle';
  return feature.get('thermometer') ? 'thermometer' : 'line';
}

/** A shape's fill, in its #rrggbb color. */
function translucent(color: string): string {
  const channel = (start: number) => parseInt(color.slice(start, start + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, 0.18)`;
}
