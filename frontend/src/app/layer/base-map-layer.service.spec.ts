import { TestBed } from '@angular/core/testing';
import type TileLayer from 'ol/layer/Tile';
import type OlMap from 'ol/Map';

import { BASE_MAP_STORAGE, BaseMapLayerService } from './base-map-layer.service';
import { BASE_MAPS } from './base-maps';

describe('BaseMapLayerService', () => {
  let stored: Map<string, string>;

  beforeEach(() => stored = new Map());

  function load(): { service: BaseMapLayerService; layer: TileLayer } {
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    } as unknown as Storage;
    TestBed.configureTestingModule({ providers: [{ provide: BASE_MAP_STORAGE, useValue: storage }] });
    const service = TestBed.inject(BaseMapLayerService);
    const added: TileLayer[] = [];
    service.load({ addLayer: (layer: TileLayer) => added.push(layer) } as unknown as OlMap);
    return { service, layer: added[0] };
  }

  it('starts on the first base map, with its attribution', () => {
    const { service, layer } = load();
    expect(service.baseMapId()).toBe(BASE_MAPS[0].id);
    expect(service.attribution()).toBe(BASE_MAPS[0].attribution);
    expect(layer.getSource()).toBeTruthy();
  });

  it('swaps the one layer\'s source, reusing a source picked before', () => {
    const { service, layer } = load();
    const streets = layer.getSource();
    service.setBaseMap('satellite');
    expect(layer.getSource()).not.toBe(streets);
    expect(service.attribution()).toContain('Esri');
    service.setBaseMap('streets');
    expect(layer.getSource()).toBe(streets);
  });

  it('remembers the pick for the next visit', () => {
    load().service.setBaseMap('satellite');
    TestBed.resetTestingModule();
    expect(load().service.baseMapId()).toBe('satellite');
  });

  it('ignores a stored id that is no longer offered', () => {
    stored.set('jetlag.baseMap', 'retired');
    expect(load().service.baseMapId()).toBe(BASE_MAPS[0].id);
  });
});
