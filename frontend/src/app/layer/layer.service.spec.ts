import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type BaseLayer from 'ol/layer/Base';
import OlMap from 'ol/Map';
import View from 'ol/View';

import { OverpassLayer } from './overpass-layer';
import { LayerService } from './layer.service';
import { MAP_LAYERS } from './map-layers';

describe('LayerService', () => {
  let service: LayerService;
  let added: BaseLayer[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LayerService);
    added = [];
    const map = { addLayer: (layer: BaseLayer) => added.push(layer), getView: () => new View(), on: vi.fn() } as unknown as OlMap;
    service.loadLayers(map);
  });

  it('has unique layer ids, labels and Overpass categories', () => {
    expect(new Set(MAP_LAYERS.map(layer => layer.id)).size).toBe(MAP_LAYERS.length);
    expect(new Set(MAP_LAYERS.map(layer => layer.label)).size).toBe(MAP_LAYERS.length);
    const categories = MAP_LAYERS.flatMap(layer => 'overpass' in layer ? [layer.overpass.category] : []);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('gives each layer at most one way of being created', () => {
    for (const layer of MAP_LAYERS) {
      expect('provider' in layer && 'overpass' in layer).toBe(false);
    }
  });

  it('adds every registered layer to the map with its default visibility', () => {
    const created = MAP_LAYERS.filter(definition => 'provider' in definition || 'overpass' in definition);
    expect(added.length).toBeGreaterThanOrEqual(created.length);
    for (const definition of MAP_LAYERS) {
      expect(service.getLayerVisibility(definition.id)).toBe(definition.visible);
    }
    for (const layer of added) {
      expect(typeof layer.getVisible()).toBe('boolean');
    }
  });

  it('toggles each layer on the map and in the visibility signal', () => {
    for (const definition of MAP_LAYERS) {
      const before = added.filter(layer => layer.getVisible()).length;
      service.setLayerVisibility(definition.id, !definition.visible);
      expect(service.visibleLayerIds().has(definition.id)).toBe(!definition.visible);
      if ('provider' in definition || 'overpass' in definition) {
        expect(added.filter(layer => layer.getVisible()).length).not.toBe(before);
      }
      service.setLayerVisibility(definition.id, definition.visible);
    }
  });

  it('only offers measurable layers that load every place', () => {
    const measurable = MAP_LAYERS.filter(definition => 'measurable' in definition && definition.measurable);
    const distanceLayers = service.getDistanceLayers();

    expect([...distanceLayers.keys()]).toEqual(measurable.map(definition => definition.id));
    for (const layer of distanceLayers.values()) {
      expect(layer).toBeInstanceOf(OverpassLayer);
      expect(layer.loadStrategy).toBe('all');
    }
  });
});
