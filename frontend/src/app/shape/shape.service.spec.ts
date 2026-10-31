import { TestBed } from '@angular/core/testing';
import Feature from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import { LayerService } from '../layer/layer.service';
import { MapService } from '../map/map.service';
import { ShapeService } from './shape.service';

describe('ShapeService', () => {
  let service: ShapeService;
  let map: OlMap;
  let addLayer: ReturnType<typeof vi.fn>;
  let addInteraction: ReturnType<typeof vi.fn>;
  let addMeasureLayer: ReturnType<typeof vi.fn>;
  let measureLayer: VectorLayer<VectorSource<Feature<Geometry>>> | undefined;

  beforeEach(() => {
    addLayer = vi.fn();
    addInteraction = vi.fn();
    addMeasureLayer = vi.fn((_map: OlMap, layer: VectorLayer<VectorSource<Feature<Geometry>>>) => {
      measureLayer = layer;
    });
    measureLayer = undefined;
    map = { addLayer, addInteraction, getView: () => new View() } as unknown as OlMap;

    TestBed.configureTestingModule({
      providers: [
        ShapeService,
        { provide: MapService, useValue: { getMap: () => map } },
        { provide: LayerService, useValue: { addMeasureLayer } }
      ]
    });

    service = TestBed.inject(ShapeService);
  });

  it('creates a styled circle and adds the measure layer and interactions once', () => {
    const circle = service.createCircle([10, 20], 50, {
      strokeColor: '#123456',
      strokeWidth: 5,
      fillColor: '#abcdef'
    });
    const geometry = circle.getGeometry();
    expect(geometry).toBeInstanceOf(CircleGeometry);
    expect(geometry?.getCenter()).toEqual([10, 20]);
    expect(geometry?.getRadius()).toBe(50);
    expect(circle.get('strokeColor')).toBe('#123456');
    expect(circle.get('strokeWidth')).toBe(5);
    expect(circle.get('fillColor')).toBe('#abcdef');

    service.createLine([[0, 0], [10, 10]]);
    expect(addMeasureLayer).toHaveBeenCalledTimes(1);
    expect(addInteraction).toHaveBeenCalledTimes(6);
    const styleFunction = measureLayer?.getStyleFunction();
    const circleStyle = styleFunction?.(circle, 1) as Style;
    expect(circleStyle.getStroke()?.getColor()).toBe('#123456');
    expect(circleStyle.getStroke()?.getWidth()).toBe(5);
    expect(circleStyle.getFill()?.getColor()).toBe('#abcdef');
    expect(circleStyle.getText()?.getText()).toContain('R ');
    const line = service.getShapes().find(shape => shape.getGeometry() instanceof LineString);
    const lineStyle = styleFunction?.(line as Feature<Geometry>, 1) as Style;
    expect(lineStyle.getText()?.getText()).toMatch(/\d+ m/);
  });

  it('creates lines and supports removing and clearing shapes', () => {
    const line = service.createLine([[0, 0], [10, 10]]);
    const circle = service.createCircle([5, 5], 2);

    expect(line.getGeometry()).toBeInstanceOf(LineString);
    expect(service.getShapes()).toHaveLength(2);

    service.removeShape(circle as Feature<Geometry>);
    expect(service.getShapes()).toEqual([line]);

    service.clearShapes();
    expect(service.getShapes()).toHaveLength(0);
    expect(service.shapeCount()).toBe(0);
    expect(service.selectedShapeCount()).toBe(0);
  });

  it('draws a thermometer as its line and a dividing line square to it through the middle', () => {
    const thermometer = service.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 58]), { strokeColor: '#123456' });
    const styles = measureLayer?.getStyleFunction()?.(thermometer, 1) as Style[];

    expect(styles).toHaveLength(2);
    expect(styles[0].getText()?.getText()).toMatch(/\d+(\.\d+)? km/);
    expect(styles[1].getStroke()?.getColor()).toBe('#123456');
    expect(styles[1].getStroke()?.getLineDash()).toBeTruthy();
    const divide = (styles[1].getGeometry() as LineString).getCoordinates().map(point => toLonLat(point));
    const middle = divide[(divide.length - 1) / 2];
    expect(middle[0]).toBeCloseTo(12, 6);
    expect(middle[1]).toBeCloseTo(57.5, 6);
  });

  it('draws no dividing line while a thermometer has a single point', () => {
    const thermometer = service.createThermometer([5, 5], [5, 5]);
    expect(measureLayer?.getStyleFunction()?.(thermometer, 1)).toBeInstanceOf(Style);
  });

  it('lists the shapes in the order drawn, numbered by kind, with their measurements', () => {
    const line = service.createLine([fromLonLat([12, 57]), fromLonLat([12, 58])]);
    service.createCircle(fromLonLat([12, 57]), 2000);
    service.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 58]));
    service.createLine([fromLonLat([12, 57]), fromLonLat([12, 57.5]), fromLonLat([12, 58])]);

    const shapes = service.shapes();
    expect(shapes.map(shape => shape.label)).toEqual(['Line 1', 'Circle 1', 'Thermometer 1', 'Line 2']);
    expect(shapes[0].feature).toBe(line);
    expect(shapes[0].measurement).toMatch(/km/);
    expect(shapes[1].measurement).toMatch(/^R /);
    expect(shapes[0].sizeMeters).toBeGreaterThan(100_000);
    expect(shapes[3].sizeMeters).toBeNull();
  });

  it('selects one shape to adjust, marks it, and forgets it once removed', () => {
    const circle = service.createCircle([5, 5], 2);
    const line = service.createLine([[0, 0], [10, 10]]);
    expect(service.selectedShape()).toBeNull();

    service.selectShape(circle);
    expect(service.selectedShape()?.feature).toBe(circle);
    expect(service.selectedShapeCount()).toBe(1);
    expect(measureLayer?.getStyleFunction()?.(circle, 1)).toHaveLength(2);

    service.selectShape(line);
    expect(service.selectedShape()?.feature).toBe(line);
    expect(measureLayer?.getStyleFunction()?.(circle, 1)).toBeInstanceOf(Style);

    service.removeShape(line);
    expect(service.selectedShape()).toBeNull();
    expect(service.selectedShapeCount()).toBe(0);
  });

  it('leaves a drawing tool when a shape is selected', () => {
    const circle = service.createCircle([5, 5], 2);
    service.setDrawMode('line');
    service.selectShape(circle);
    expect(service.drawMode()).toBeNull();
  });

  it('sets a circle\'s radius and a straight line\'s length on the ground', () => {
    const circle = service.createCircle(fromLonLat([12, 57]), 2000);
    const line = service.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 57.1]));
    const size = (feature: Feature<Geometry>) => service.shapes().find(shape => shape.feature === feature)?.sizeMeters;

    expect(service.setShapeSize(circle, 1500)).toBe(true);
    expect(size(circle)).toBeCloseTo(1500, 0);
    expect((circle.getGeometry() as CircleGeometry).getCenter()).toEqual(fromLonLat([12, 57]));

    expect(service.setShapeSize(line, 3000)).toBe(true);
    expect(size(line)).toBeCloseTo(3000, 0);
    expect(service.setShapeSize(circle, 150_000)).toBe(true);
    expect(size(circle)).toBeCloseTo(150_000, -1);
    expect(line.getGeometry()?.getFirstCoordinate()).toEqual(fromLonLat([12, 57]));

    expect(service.setShapeSize(line, 0)).toBe(false);
    const bent = service.createLine([[0, 0], [10, 10], [20, 0]]);
    expect(service.setShapeSize(bent, 100)).toBe(false);
  });

  it('places a shape by its points: a circle\'s center, and each point of a line', () => {
    const circle = service.createCircle(fromLonLat([12, 57]), 2000);
    const thermometer = service.createThermometer(fromLonLat([12, 57]), fromLonLat([12, 58]));
    const line = service.createLine([fromLonLat([12, 57]), fromLonLat([12, 57.5]), fromLonLat([12, 58])]);
    const summary = (feature: Feature<Geometry>) => service.shapes().find(shape => shape.feature === feature)!;

    expect(summary(circle).points.map(point => point.label)).toEqual(['Center']);
    expect(summary(thermometer).points.map(point => point.label)).toEqual(['Start', 'End']);
    expect(summary(line).points.map(point => point.label)).toEqual(['Point 1', 'Point 2', 'Point 3']);
    expect(summary(line).points[1].latitude).toBeCloseTo(57.5, 6);

    const radius = summary(circle).sizeMeters!;
    expect(service.moveShapePoint(circle, 0, 15, 40)).toBe(true);
    expect(summary(circle).points[0].longitude).toBeCloseTo(15, 6);
    expect(summary(circle).points[0].latitude).toBeCloseTo(40, 6);
    expect(summary(circle).sizeMeters).toBeCloseTo(radius, 0);

    // Only the point asked for moves, and the dividing line follows
    expect(service.moveShapePoint(thermometer, 1, 12, 59)).toBe(true);
    expect(summary(thermometer).points[0].latitude).toBeCloseTo(57, 6);
    expect(summary(thermometer).points[1].latitude).toBeCloseTo(59, 6);
    const styles = measureLayer?.getStyleFunction()?.(thermometer, 1) as Style[];
    const divide = (styles[1].getGeometry() as LineString).getCoordinates().map(point => toLonLat(point));
    expect(divide[(divide.length - 1) / 2][1]).toBeCloseTo(58, 6);

    expect(service.moveShapePoint(line, 1, 13, 57.5)).toBe(true);
    expect(summary(line).points.map(point => Math.round(point.longitude))).toEqual([12, 13, 12]);
  });

  it('refuses points off the map', () => {
    const line = service.createLine([fromLonLat([12, 57]), fromLonLat([12, 58])]);
    expect(service.moveShapePoint(line, 0, 12, 90)).toBe(false);
    expect(service.moveShapePoint(line, 0, 181, 57)).toBe(false);
    expect(service.moveShapePoint(line, 0, Number.NaN, 57)).toBe(false);
    expect(service.moveShapePoint(line, 2, 12, 57)).toBe(false);
    expect(service.shapes()[0].points[0].latitude).toBeCloseTo(57, 6);
  });

  it('restyles a shape, its fill following its color', () => {
    const circle = service.createCircle([5, 5], 2);

    service.restyleShape(circle, { strokeColor: '#102030', strokeWidth: 6 });
    expect(service.selectedShape()).toBeNull();
    expect(circle.get('strokeColor')).toBe('#102030');
    expect(circle.get('strokeWidth')).toBe(6);
    expect(circle.get('fillColor')).toBe('rgba(16, 32, 48, 0.18)');

    service.restyleShape(circle, { filled: false });
    expect(service.shapes()[0].filled).toBe(false);
  });

  it('rejects invalid shape dimensions', () => {
    expect(() => service.createCircle([0, 0], 0)).toThrow(RangeError);
    expect(() => service.createLine([[0, 0]])).toThrow(RangeError);
  });
});