import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import type { Geometry } from 'ol/geom';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import View from 'ol/View';
import { ClosestLocationsService } from './closest-locations.service';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { LayerService } from '../layer/layer.service';
import type { MapLayerId } from '../layer/layer.service';
import { GeolocationService } from '../position/geolocation.service';
import type { GeoPosition } from '../position/geolocation.service';

function place(name: string, longitude: number, latitude: number): Feature<Geometry> {
  return new Feature({ place: { osmType: 'NODE', osmId: name.length, name, longitude, latitude } });
}

/** Stands in for a layer service: just its loaded features. */
function layer(features: Feature<Geometry>[]) {
  return { getFeatures: () => features, onFeaturesChange: () => () => undefined };
}

describe('ClosestLocationsService', () => {
  const visibleLayerIds = signal<ReadonlySet<MapLayerId>>(new Set());
  const position = signal<GeoPosition | null>(null);
  const layers = new Map<MapLayerId, ReturnType<typeof layer>>([
    ['zoos', layer([place('Far zoo', 13, 58), place('Near zoo', 12.01, 57.7)])],
    ['museums', layer([place('Museum', 12.3, 57.7)])],
    ['hospitals', layer([])],
    // A rail line running east-west through 57.71°N; its stored point is far to the east
    ['high_speed_rail', layer([new Feature({
      geometry: new LineString([fromLonLat([11.9, 57.71]), fromLonLat([12.1, 57.71])]),
      place: { osmType: 'WAY', osmId: 9, name: 'Line', longitude: 14, latitude: 57.71 }
    })])]
  ]);

  beforeEach(() => {
    visibleLayerIds.set(new Set());
    position.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: LayerService, useValue: { visibleLayerIds, getDistanceLayers: () => layers } },
        { provide: GeolocationService, useValue: { position, error: signal(null), track: () => () => undefined } }
      ]
    });
  });

  it('lists the closest place on each open layer, nearest first', () => {
    const service = TestBed.inject(ClosestLocationsService);
    TestBed.inject(ControlsPanelService).select('distances');
    service.positionSource.set('gps');
    position.set({ longitude: 12, latitude: 57.7, accuracyMeters: 5, timestamp: 0 });
    visibleLayerIds.set(new Set<MapLayerId>(['museums', 'zoos', 'hospitals', 'parks']));

    const results = service.results();
    expect(results.map(result => [result.layerId, result.name])).toEqual([
      ['zoos', 'Near zoo'],
      ['museums', 'Museum']
    ]);
    expect(results[0].distanceMeters).toBeGreaterThan(500);
    expect(results[0].distanceMeters).toBeLessThan(700);
  });

  it('measures lines to their nearest point rather than their stored point', () => {
    const service = TestBed.inject(ClosestLocationsService);
    service.initialize({ addLayer: vi.fn(), on: vi.fn(), getView: () => new View() } as unknown as OlMap);
    TestBed.inject(ControlsPanelService).select('distances');
    service.positionSource.set('gps');
    position.set({ longitude: 12, latitude: 57.7, accuracyMeters: 5, timestamp: 0 });
    visibleLayerIds.set(new Set<MapLayerId>(['high_speed_rail']));

    const [line] = service.results();
    expect(line.longitude).toBeCloseTo(12, 3);
    expect(line.latitude).toBeCloseTo(57.71, 3);
    expect(line.distanceMeters).toBeGreaterThan(1000);   // 0.01° of latitude is about 1.1 km
    expect(line.distanceMeters).toBeLessThan(1200);
  });

  it('computes nothing while inactive', () => {
    const service = TestBed.inject(ClosestLocationsService);
    service.positionSource.set('gps');
    position.set({ longitude: 12, latitude: 57.7, accuracyMeters: 5, timestamp: 0 });
    visibleLayerIds.set(new Set<MapLayerId>(['zoos']));

    expect(service.results()).toEqual([]);
  });

  it('keeps measuring with the panel closed, until another tab is selected', () => {
    const service = TestBed.inject(ClosestLocationsService);
    const controls = TestBed.inject(ControlsPanelService);
    controls.show('distances');
    service.positionSource.set('gps');
    position.set({ longitude: 12, latitude: 57.7, accuracyMeters: 5, timestamp: 0 });
    visibleLayerIds.set(new Set<MapLayerId>(['zoos']));

    controls.toggle();
    expect(controls.open()).toBe(false);
    expect(service.results().map(result => result.name)).toEqual(['Near zoo']);

    controls.select('layers');
    expect(service.results()).toEqual([]);
  });
});
