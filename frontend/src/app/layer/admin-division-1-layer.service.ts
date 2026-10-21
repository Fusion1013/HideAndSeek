import { Injectable } from '@angular/core';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style, Text } from 'ol/style';
import CircleStyle from 'ol/style/Circle';

import { BaseOverpassService, LoadStrategy } from './base-overpass.service';
import { OverpassLocationDTO } from '../api/generated';

@Injectable({ providedIn: 'root' })
export class AdminDivision1Service extends BaseOverpassService {
  protected override readonly category = 'ADMIN_DIVISION_1';
  protected override readonly loadStrategy: LoadStrategy = 'all';   // a few dozen features: load once
  protected override readonly layerZIndex = 60;

  private readonly color = '#db9868';
  private readonly styles = new Map<string, Style>();

  protected override getStyle(feature: FeatureLike): Style {
    const place = feature.get('place') as OverpassLocationDTO;
    const name = place.name ?? '';

    let style = this.styles.get(name);
    if (!style) {
      style = new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: this.color }),
          stroke: new Stroke({ color: '#ffffff', width: 2 })
        }),
        text: new Text({
          text: name,
          font: 'bold 16px sans-serif',
          offsetY: -18,
          fill: new Fill({ color: this.color }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        }),
        zIndex: 200
      });
      this.styles.set(name, style);
    }
    return style;
  }
}