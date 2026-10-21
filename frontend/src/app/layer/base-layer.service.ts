import type OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';

export abstract class BaseLayerService {
  public load(map: OlMap): BaseLayer[] {
    const layers = this.createLayers(map);
    for (const layer of layers) {
      map.addLayer(layer);
    }
    return layers;
  }

  protected abstract createLayers(map: OlMap): BaseLayer[];
}