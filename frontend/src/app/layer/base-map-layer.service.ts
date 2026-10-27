import { computed, DOCUMENT, inject, Injectable, InjectionToken, signal } from '@angular/core';
import TileLayer from 'ol/layer/Tile';
import OlMap from 'ol/Map';
import type TileSource from 'ol/source/Tile';
import { BaseLayerService } from './base-layer.service';
import { BASE_MAPS, DEFAULT_BASE_MAP } from './base-maps';
import type { BaseMapId } from './base-maps';

const STORAGE_KEY = 'jetlag.baseMap';

/** Where the picked base map is remembered: the page's local storage, or null where there is none. */
export const BASE_MAP_STORAGE = new InjectionToken<Storage | null>('BASE_MAP_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
});

/**
 * The map under every other layer. One layer whose source is swapped when another base map is picked, so
 * whatever copies the layer (the image export) draws the picked one. Each source is made when first picked.
 */
@Injectable({ providedIn: 'root' })
export class BaseMapLayerService extends BaseLayerService {
  private readonly storage = inject(BASE_MAP_STORAGE);
  private readonly sources = new Map<BaseMapId, TileSource>();
  private readonly layer = new TileLayer();

  private readonly selected = signal<BaseMapId>(this.readStored());
  readonly baseMapId = this.selected.asReadonly();
  readonly attribution = computed(() => definitionOf(this.selected()).attribution);

  constructor() {
    super();
    this.layer.setSource(this.sourceFor(this.selected()));
  }

  public setBaseMap(id: BaseMapId): void {
    this.selected.set(id);
    this.layer.setSource(this.sourceFor(id));
    try {
      this.storage?.setItem(STORAGE_KEY, id);
    } catch {
      // Not remembered for the next visit
    }
  }

  protected override createLayers(_map: OlMap) {
    return [this.layer];
  }

  private sourceFor(id: BaseMapId): TileSource {
    let source = this.sources.get(id);
    if (!source) {
      source = definitionOf(id).createSource();
      this.sources.set(id, source);
    }
    return source;
  }

  private readStored(): BaseMapId {
    try {
      const stored = this.storage?.getItem(STORAGE_KEY);
      return BASE_MAPS.find(baseMap => baseMap.id === stored)?.id ?? DEFAULT_BASE_MAP;
    } catch {
      return DEFAULT_BASE_MAP;
    }
  }
}

function definitionOf(id: BaseMapId) {
  return BASE_MAPS.find(baseMap => baseMap.id === id) ?? BASE_MAPS[0];
}

