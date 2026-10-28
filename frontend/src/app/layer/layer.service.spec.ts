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

  it('has unique layer ids, labels and Overpass sources', () => {
    expect(new Set(MAP_LAYERS.map(layer => layer.id)).size).toBe(MAP_LAYERS.length);
    expect(new Set(MAP_LAYERS.map(layer => layer.label)).size).toBe(MAP_LAYERS.length);
    // A category can have one layer of places and one of Voronoi cells
    const sources = MAP_LAYERS.flatMap(layer => 'overpass' in layer
      ? [`${layer.overpass.category} ${'source' in layer.overpass ? layer.overpass.source : 'places'}`]
      : []);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('ties each region layer to a layer of places of the same category', () => {
    for (const layer of MAP_LAYERS) {
      if (!('regionsOf' in layer)) continue;
      const parent = MAP_LAYERS.find(other => other.id === layer.regionsOf);
      expect(parent && 'overpass' in parent && !('regionsOf' in parent)).toBe(true);
      expect(parent && 'overpass' in parent && parent.overpass.category).toBe(layer.overpass.category);
    }
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
