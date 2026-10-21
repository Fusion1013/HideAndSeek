import { TestBed } from '@angular/core/testing';
import Feature from 'ol/Feature';
import CircleGeometry from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import OlMap from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { LayerService } from './layer.service';
import { StationMeasurementService } from './station-measurement.service';

describe('StationMeasurementService', () => {
  let service: StationMeasurementService;
  let layer: VectorLayer<VectorSource<Feature<Geometry>>> | undefined;
  let map: OlMap;

  beforeEach(() => {
    layer = undefined;
    map = {
      getView: () => new View({ projection: 'EPSG:3857' })
    } as unknown as OlMap;
    TestBed.configureTestingModule({
      providers: [
        StationMeasurementService,
        { provide: LayerService, useValue: { addMeasureLayer: (_map: OlMap, measureLayer: VectorLayer<VectorSource<Feature<Geometry>>>) => { layer = measureLayer; } } }
      ]
    });
    service = TestBed.inject(StationMeasurementService);
    service.initialize(map);
  });

  it('draws a configurable radius and adds/removes measured points', () => {
    service.selectStop({ stopId: 'station-1', latitude: 0, longitude: 0 });
    expect(service.selectedStop()?.stopId).toBe('station-1');
    expect(layer?.getSource()?.getFeatures()).toHaveLength(1);

    expect(service.setRadiusMeters(500)).toBe(true);
    const radiusFeature = layer?.getSource()?.getFeatures()[0];
    expect(radiusFeature?.getGeometry()).toBeInstanceOf(CircleGeometry);
    expect((radiusFeature?.getGeometry() as CircleGeometry).getRadius()).toBe(500);
    expect(service.setRadiusMeters(0)).toBe(false);

    const point = service.addMeasurePoint([1000, 0]);
    expect(point?.distanceMeters).toBeGreaterThan(0);
    expect(service.measurePoints()).toEqual([point]);
    expect(layer?.getSource()?.getFeatures()).toHaveLength(3);

    if (!point) return;
    service.removeMeasurePoint(point.id);
    expect(service.measurePoints()).toEqual([]);
    expect(layer?.getSource()?.getFeatures()).toHaveLength(1);
  });
});