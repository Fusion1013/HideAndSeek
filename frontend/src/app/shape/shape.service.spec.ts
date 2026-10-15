import { TestBed } from '@angular/core/testing';
import Feature from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import OlMap from 'ol/Map';
import View from 'ol/View';
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
    expect(addInteraction).toHaveBeenCalledTimes(5);
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

  it('rejects invalid shape dimensions', () => {
    expect(() => service.createCircle([0, 0], 0)).toThrow(RangeError);
    expect(() => service.createLine([[0, 0]])).toThrow(RangeError);
  });
});