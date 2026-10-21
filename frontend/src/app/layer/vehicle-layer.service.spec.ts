import { TestBed } from '@angular/core/testing';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import OlMap from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Style from 'ol/style/Style';
import { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { TransitService } from '../transit/transit.service';
import { VehicleLayerService } from './vehicle-layer.service';

describe('VehicleLayerService', () => {
  it('uses route short names and highlights matching vehicles without hiding others', async () => {
    const positions: VehiclePosition[] = [
      { id: 'vehicle-a', routeId: 'route-a', latitude: 57.7, longitude: 12 },
      { id: 'vehicle-b', routeId: 'route-b', latitude: 57.8, longitude: 12.1 },
      { id: 'vehicle-c', tripId: 'trip-c', latitude: 57.9, longitude: 12.2 }
    ];
    TestBed.configureTestingModule({
      providers: [
        VehicleLayerService,
        { provide: TransitService, useValue: { refreshVehiclePositions: () => Promise.resolve(positions) } }
      ]
    });
    const service = TestBed.inject(VehicleLayerService);
    const map = { addLayer: vi.fn(), getView: () => new View() } as unknown as OlMap;
    const layer = service.load(map)[0] as VectorLayer<VectorSource<Feature<Point>>>;
    service.setRouteMetadata([
      { routeId: 'route-a', routeShortName: 'A1' },
      { routeId: 'route-b', routeShortName: 'B2' }
    ]);
    service.setTripRouteIds(new Map([['trip-c', 'route-a']]));
    service.setHighlightedRouteIds(['route-a']);

    await service.refreshVehiclePositions(map);

    const features = layer.getSource()?.getFeatures() ?? [];
    expect(features).toHaveLength(3);
    expect(features.map(feature => feature.get('vehicleLabel'))).toEqual(['A1', 'B2', 'A1']);
    const highlightedStyles = features[0].getStyleFunction()?.(features[0], 1) as Style[];
    const otherStyles = features[1].getStyleFunction()?.(features[1], 1) as Style[];
    expect((highlightedStyles[0].getImage() as CircleStyle).getRadius()).toBe(8);
    expect((otherStyles[0].getImage() as CircleStyle).getRadius()).toBe(4);
    const tripOnlyStyles = features[2].getStyleFunction()?.(features[2], 1) as Style[];
    expect((tripOnlyStyles[0].getImage() as CircleStyle).getRadius()).toBe(8);
  });
});