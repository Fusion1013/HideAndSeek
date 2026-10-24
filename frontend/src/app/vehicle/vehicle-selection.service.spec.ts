import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type { VehiclePosition } from '../api/generated';
import { TripControllerService } from '../api/generated';
import { RouteShapesLayerService } from '../layer/route-shapes-layer.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { MapService } from '../map/map.service';
import { TransitService } from '../transit/transit.service';
import { VehicleSelectionService } from './vehicle-selection.service';
import { VehicleTripService } from './vehicle-trip.service';

describe('VehicleSelectionService', () => {
  const shapeFor = (tripId: string) => [{ shapeId: `shape-${tripId}`, shapePtSequence: 1, shapePtLat: 57.7, shapePtLon: 14 }];
  let positions: VehiclePosition[];
  let load: ReturnType<typeof vi.fn>;
  let getTripsByTripIds: ReturnType<typeof vi.fn>;
  let setVehicleRouteShape: ReturnType<typeof vi.fn>;
  let focusOnCoordinates: ReturnType<typeof vi.fn>;
  let service: VehicleSelectionService;
  let transit: TransitService;

  beforeEach(() => {
    positions = [
      { id: 'bus-1', tripId: 'trip-1', latitude: 57.78, longitude: 14.16 },
      { id: 'bus-2', tripId: 'trip-2', latitude: 57.79, longitude: 14.17 }
    ];
    load = vi.fn((tripId: string) => of({ trip: { tripId }, stopTimes: [], shape: shapeFor(tripId) }));
    getTripsByTripIds = vi.fn((tripIds: string[]) => of(tripIds.map(tripId => ({ tripId, routeId: `route-${tripId}` }))));
    setVehicleRouteShape = vi.fn();
    focusOnCoordinates = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: VehicleTripService, useValue: { load } },
        { provide: TripControllerService, useValue: { getTripsByTripIds } },
        { provide: RouteShapesLayerService, useValue: { setVehicleRouteShape } },
        { provide: MapService, useValue: { getMap: () => ({}), focusOnCoordinates } },
        { provide: VehicleLayerService, useValue: {
          setTripRouteIds: vi.fn(),
          refreshVehiclePositions: async () => transit.vehiclePositions.set(positions)
        } }
      ]
    });
    transit = TestBed.inject(TransitService);
    transit.vehiclePositions.set(positions);
    service = TestBed.inject(VehicleSelectionService);
  });

  it('fills in each vehicle\'s route from its trip', async () => {
    await vi.waitFor(() => expect(service.vehicles().map(vehicle => vehicle.routeId)).toEqual(['route-trip-1', 'route-trip-2']));
    expect(getTripsByTripIds).toHaveBeenCalledWith(['trip-1', 'trip-2']);
  });

  it('follows the vehicle just selected: centres it, loads its trip and draws its route', async () => {
    service.select(['id:bus-1']);
    service.select(['id:bus-1', 'id:bus-2']);
    await vi.waitFor(() => expect(service.trip()?.trip?.tripId).toBe('trip-2'));
    TestBed.tick();

    expect(service.followedVehicle()?.id).toBe('bus-2');
    expect(focusOnCoordinates).toHaveBeenLastCalledWith(14.17, 57.79);
    expect(setVehicleRouteShape).toHaveBeenLastCalledWith(shapeFor('trip-2'));
  });

  it('loads the trip once while the vehicle keeps moving on it, and again when it starts another', async () => {
    service.select(['id:bus-1']);
    await vi.waitFor(() => expect(service.trip()).toBeDefined());
    expect(load).toHaveBeenCalledTimes(1);

    positions = [{ ...positions[0], latitude: 57.785 }, positions[1]];
    await service.refresh();
    TestBed.tick();
    expect(load).toHaveBeenCalledTimes(1);

    positions = [{ ...positions[0], tripId: 'trip-9' }, positions[1]];
    await service.refresh();
    await vi.waitFor(() => expect(service.trip()?.trip?.tripId).toBe('trip-9'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not look up routes again while the same trips are running', async () => {
    await vi.waitFor(() => expect(getTripsByTripIds).toHaveBeenCalledTimes(1));
    positions = positions.map(position => ({ ...position, latitude: position.latitude! + 0.001 }));
    await service.refresh();
    TestBed.tick();

    expect(getTripsByTripIds).toHaveBeenCalledTimes(1);
  });

  it('deselects vehicles that leave the feed, and removes their route', async () => {
    service.select(['id:bus-1']);
    await vi.waitFor(() => expect(service.trip()).toBeDefined());

    positions = [positions[1]];
    await service.refresh();
    TestBed.tick();

    expect(service.selectedIds()).toEqual([]);
    expect(service.followedVehicle()).toBeNull();
    expect(setVehicleRouteShape).toHaveBeenLastCalledWith(null);
  });

  it('clears the selection and the route', async () => {
    service.selectOnly(positions[0]);
    await vi.waitFor(() => expect(service.trip()).toBeDefined());

    service.clear();
    TestBed.tick();

    expect(service.selectedVehicles()).toEqual([]);
    expect(setVehicleRouteShape).toHaveBeenLastCalledWith(null);
  });
});
