import { inject, Injectable, signal } from '@angular/core';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { fromLonLat } from 'ol/proj';
import { LayerService } from '../layer/layer.service';

@Injectable({
  providedIn: 'root',
})
export class MapService {

  private readonly layerService = inject(LayerService);

  private readonly map = signal<OlMap | null>(null);

  public async createMap(target: HTMLElement): Promise<void> {
    const map = new OlMap({
      target,
      layers: [],
      view: new View({
        center: fromLonLat([12.0799, 57.7206]),
        zoom: 11
      })
    });

    this.map.set(map);
    this.layerService.loadLayers(map);
  }

  public getMap(): OlMap | null {
    return this.map();
  }

  public focusOnCoordinates(longitude: number, latitude: number): void {
    const map = this.map();
    if (!map) return;

    const view = map.getView();
    view.animate({
      center: fromLonLat([longitude, latitude], view.getProjection()),
      zoom: Math.max(view.getZoom() ?? 11, 15),
      duration: 450
    });
  }

}
