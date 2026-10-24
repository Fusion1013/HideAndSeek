import type OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';

/** A service that adds its OpenLayers layers to the map and returns them. */
export interface MapLayerProvider {
  load(map: OlMap): BaseLayer[];
}

export abstract class BaseLayerService implements MapLayerProvider {
  public load(map: OlMap): BaseLayer[] {
    const layers = this.createLayers(map);
    for (const layer of layers) {
      map.addLayer(layer);
    }
    return layers;
  }

  protected abstract createLayers(map: OlMap): BaseLayer[];
}
