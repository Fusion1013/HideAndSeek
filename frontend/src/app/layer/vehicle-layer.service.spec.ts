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
import { MOVE_DURATION_MS, VehicleLayerService } from './vehicle-layer.service';

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

  describe('when positions update', () => {
    let positions: VehiclePosition[];
    let service: VehicleLayerService;
    let map: OlMap;
    let source: VectorSource<Feature<Point>>;

    beforeEach(() => {
      positions = [
        { id: 'bus-1', latitude: 57.78, longitude: 14.16 },
        { id: 'bus-2', latitude: 57.79, longitude: 14.17 }
      ];
      TestBed.configureTestingModule({
        providers: [
          VehicleLayerService,
          { provide: TransitService, useValue: { refreshVehiclePositions: () => Promise.resolve(positions) } }
        ]
      });
      service = TestBed.inject(VehicleLayerService);
      map = { addLayer: vi.fn(), getView: () => new View() } as unknown as OlMap;
      source = (service.load(map)[0] as VectorLayer<VectorSource<Feature<Point>>>).getSource()!;
    });

    afterEach(() => vi.unstubAllGlobals());

    it('glides each marker from where it was to where it is now', async () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
      vi.spyOn(performance, 'now').mockReturnValue(0);
      await service.refreshVehiclePositions(map);
      const marker = source.getFeatureById('id:bus-1') as Feature<Point>;
      const [startX] = marker.getGeometry()!.getCoordinates();

      positions = [{ id: 'bus-1', latitude: 57.78, longitude: 14.165 }];
      await service.refreshVehiclePositions(map);

      // Same marker, still at the old position until the animation runs
      expect(source.getFeatureById('id:bus-1')).toBe(marker);
      expect(marker.getGeometry()!.getCoordinates()[0]).toBe(startX);
      frames.shift()!(MOVE_DURATION_MS / 2);
      const halfwayX = marker.getGeometry()!.getCoordinates()[0];
      expect(halfwayX).toBeGreaterThan(startX);
      frames.shift()!(MOVE_DURATION_MS);
      const endX = marker.getGeometry()!.getCoordinates()[0];
      expect(endX).toBeGreaterThan(halfwayX);
      expect(halfwayX - startX).toBeCloseTo((endX - startX) / 2, 0);
      expect(frames).toHaveLength(0);

      // Vehicles that left the feed are removed
      expect(source.getFeatureById('id:bus-2')).toBeNull();
    });

    it('moves markers at once when reduced motion is preferred', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      const requestFrame = vi.fn();
      vi.stubGlobal('requestAnimationFrame', requestFrame);
      await service.refreshVehiclePositions(map);
      const marker = source.getFeatureById('id:bus-1') as Feature<Point>;
      const [startX] = marker.getGeometry()!.getCoordinates();

      positions = [{ id: 'bus-1', latitude: 57.78, longitude: 14.165 }, positions[1]];
      await service.refreshVehiclePositions(map);

      expect(marker.getGeometry()!.getCoordinates()[0]).toBeGreaterThan(startX);
      expect(requestFrame).not.toHaveBeenCalled();
    });
  });
});
