import { Injectable } from '@angular/core';
import TileLayer from 'ol/layer/Tile';
import OlMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import { BaseLayerService } from './base-layer.service';

@Injectable({ providedIn: 'root' })
export class BaseMapLayerService extends BaseLayerService {
  private readonly source = new OSM();

  protected override createLayers(_map: OlMap) {
    return [new TileLayer({ source: this.source })];
  }
}