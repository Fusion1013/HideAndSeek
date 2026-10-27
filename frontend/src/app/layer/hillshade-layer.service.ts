import { Injectable } from '@angular/core';
import TileLayer from 'ol/layer/Tile';
import OlMap from 'ol/Map';
import XYZ from 'ol/source/XYZ';
import { BaseLayerService } from './base-layer.service';
import { HILLSHADE_ATTRIBUTION } from './base-maps';

/** Terrain shading laid over the base map, faint enough that the map's own labels stay readable. */
@Injectable({ providedIn: 'root' })
export class HillshadeLayerService extends BaseLayerService {
  private readonly source = new XYZ({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    attributions: HILLSHADE_ATTRIBUTION,
    // Past this the shading only gets blurrier; OpenLayers scales up the last level instead
    maxZoom: 16,
    crossOrigin: 'anonymous'
  });

  protected override createLayers(_map: OlMap) {
    return [new TileLayer({ source: this.source, opacity: 0.75 })];
  }
}
