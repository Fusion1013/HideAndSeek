import { TestBed } from '@angular/core/testing';
import OlMap from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import { of } from 'rxjs';
import { StopControllerService } from '../api/generated';
import { StopsLayerService } from './stops-layer.service';

describe('StopsLayerService', () => {
  it('shows only matching stop features and restores all when the filter is cleared', () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: StopControllerService,
        useValue: {
          getStops: () => of([
            { stopId: 'stop-a', stopName: 'A', longitude: 12, latitude: 57 },
            { stopId: 'stop-b', stopName: 'B', longitude: 12.1, latitude: 57.1 },
            { stopId: 'stop-c', stopName: 'C', longitude: 12.2, latitude: 57.2 }
          ])
        }
      }]
    });
    const service = TestBed.inject(StopsLayerService);
    const map = { getView: () => new View(), addLayer: vi.fn() } as unknown as OlMap;
    const layer = service.load(map)[0] as VectorLayer;
    const source = layer.getSource();

    expect(source?.getFeatures()).toHaveLength(3);
    service.setVisibleStopIds(['stop-a', 'stop-c']);
    expect(source?.getFeatures().map(feature => feature.get('stopId'))).toEqual(['stop-a', 'stop-c']);

    service.setVisibleStopIds(null);
    expect(source?.getFeatures().map(feature => feature.get('stopId'))).toEqual(['stop-a', 'stop-b', 'stop-c']);
  });
});