import { Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { Fill, Stroke, Style, Text } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { BaseLayerService } from './base-layer.service';

@Injectable({ providedIn: 'root' })
export class DistrictLayerService extends BaseLayerService {
  private readonly source = new VectorSource<Feature<Geometry>>({
    url: 'data/sweden-distrikt2.geojson',
    format: new GeoJSON({ featureProjection: 'EPSG:3857' })
  });
  private readonly districtColor = '#0059a9';
  private readonly districtStroke = new Stroke({ color: this.districtColor, width: 2 });
  private readonly districtFill = new Fill({ color: 'rgba(0, 89, 169, 0.1)' });
  private readonly labelStyles = new Map<string, Style>();

  protected override createLayers(_map: OlMap) {
    return [new VectorLayer({
      source: this.source,
      style: feature => this.getDistrictStyle(String(feature.get('distriktsnamn') || ''))
    })];
  }

  private getDistrictStyle(name: string): Style {
    let style = this.labelStyles.get(name);
    if (!style) {
      style = new Style({
        text: new Text({
          text: name,
          font: 'bold 24px sans-serif',
          fill: new Fill({ color: this.districtColor }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        }),
        stroke: this.districtStroke,
        fill: this.districtFill,
        zIndex: 100
      });
      this.labelStyles.set(name, style);
    }
    return style;
  }
}