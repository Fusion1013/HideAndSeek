import { inject, Injectable, Injector, signal } from '@angular/core';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import type BaseLayer from 'ol/layer/Base';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import { OverpassService } from '../api/generated';
import { OverpassLayer } from './overpass-layer';
import { MAP_LAYERS } from './map-layers';
import type { MapLayerDefinition, MapLayerId } from './map-layers';
import type { MapLayerProvider } from './base-layer.service';

export type { MapLayerId } from './map-layers';

@Injectable({
  providedIn: 'root',
})
export class LayerService {
  private readonly injector = inject(Injector);
  private readonly overpassApi = inject(OverpassService);
  private readonly registeredLayers = new Map<MapLayerId, BaseLayer[]>();

  /** The object that creates each layer: its service, or an {@link OverpassLayer} built from its settings. */
  private readonly providers: ReadonlyMap<MapLayerId, MapLayerProvider> = new Map(
    (MAP_LAYERS as readonly MapLayerDefinition[]).flatMap(definition => {
      const provider = this.createProvider(definition);
      return provider ? [[definition.id as MapLayerId, provider] as const] : [];
    })
  );

  private readonly distanceLayers: ReadonlyMap<MapLayerId, OverpassLayer> = new Map(
    (MAP_LAYERS as readonly MapLayerDefinition[]).flatMap(definition => {
      const provider = this.providers.get(definition.id as MapLayerId);
      return definition.measurable && provider instanceof OverpassLayer
        ? [[definition.id as MapLayerId, provider] as const]
        : [];
    })
  );

  /** Layers currently shown on the map, starting from each layer's default. */
  readonly visibleLayerIds = signal<ReadonlySet<MapLayerId>>(
    new Set(MAP_LAYERS.filter(layer => layer.visible).map(layer => layer.id))
  );

  public loadLayers(map: OlMap): void {
    for (const [layerId, provider] of this.providers) {
      this.registerLayers(layerId, provider.load(map));
    }
  }

  public setLayerVisibility(layerId: MapLayerId, visible: boolean): void {
    this.registeredLayers.get(layerId)?.forEach(layer => layer.setVisible(visible));
    this.visibleLayerIds.update(ids => {
      if (ids.has(layerId) === visible) return ids;
      const next = new Set(ids);
      if (visible) next.add(layerId); else next.delete(layerId);
      return next;
    });
  }

  /** Layers marked `measurable` in the registry, e.g. for "closest location" distances. */
  public getDistanceLayers(): ReadonlyMap<MapLayerId, OverpassLayer> {
    return this.distanceLayers;
  }

  /**
   * Whether the map layer loads its data when first drawn (places from the backend, the districts file), rather
   * than holding what it was given. Only such sources report the end of a load; the others report a start only.
   */
  public loadsOnDemand(layerId: MapLayerId): boolean {
    return this.providers.get(layerId) instanceof OverpassLayer || this.layersFor(layerId).some(layer =>
      layer instanceof VectorLayer && layer.getSource()?.getUrl() !== undefined);
  }

  /** The OpenLayers layers drawn for a map layer, e.g. to draw the same sources in another map. */
  public layersFor(layerId: MapLayerId): readonly BaseLayer[] {
    return this.registeredLayers.get(layerId) ?? [];
  }

  public getLayerVisibility(layerId: MapLayerId): boolean {
    return this.visibleLayerIds().has(layerId);
  }

  public addMeasureLayer(map: OlMap, layer: VectorLayer<VectorSource<Feature<Geometry>>>): void {
    layer.setVisible(this.getLayerVisibility('measurements'));
    const measurementLayers = this.registeredLayers.get('measurements') ?? [];
    measurementLayers.push(layer);
    this.registeredLayers.set('measurements', measurementLayers);
    map.addLayer(layer);
  }

  private createProvider(definition: MapLayerDefinition): MapLayerProvider | undefined {
    if (definition.overpass) return new OverpassLayer(this.overpassApi, definition.overpass);
    return definition.provider && this.injector.get(definition.provider);
  }

  private registerLayers(layerId: MapLayerId, layers: BaseLayer[]): void {
    const visible = this.getLayerVisibility(layerId);
    layers.forEach(layer => layer.setVisible(visible));
    this.registeredLayers.set(layerId, layers);
  }
}
