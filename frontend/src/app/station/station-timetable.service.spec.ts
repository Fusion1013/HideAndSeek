import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import type { Observable } from 'rxjs';

import type { StopDTO } from '../api/generated';
import { StopTimeControllerService, TripControllerService } from '../api/generated';
import { StationMeasurementService } from '../layer/station-measurement.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { StationTimetableService } from './station-timetable.service';

describe('StationTimetableService', () => {
  let stopTimesByStop: Record<string, Observable<unknown>>;
  let selectedStop: ReturnType<typeof signal<StopDTO | null>>;
  let addMeasurePoint: ReturnType<typeof vi.fn>;
  let setHighlightedRouteIds: ReturnType<typeof vi.fn>;
  let service: StationTimetableService;

  const settle = async (check: () => void) => vi.waitFor(() => {
    TestBed.tick();
    check();
  });

  beforeEach(() => {
    stopTimesByStop = {
      'stop-1': of([
        { tripId: 'trip-late', stopSequence: 2, arrivalTime: '09:10:00', departureTime: '09:11:00' },
        { tripId: 'trip-early', stopSequence: 1, arrivalTime: '08:00:00', departureTime: '08:02:00' }
      ]),
      'stop-2': of([{ tripId: 'trip-other', stopSequence: 1, arrivalTime: '10:00:00' }])
    };
    selectedStop = signal<StopDTO | null>(null);
    addMeasurePoint = vi.fn(() => true);
    setHighlightedRouteIds = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: StopTimeControllerService, useValue: { getStopTimesByStopId: (stopId: string) => stopTimesByStop[stopId] } },
        { provide: TripControllerService, useValue: {
          getTripsByTripIds: (tripIds: string[]) => of(tripIds.map(tripId => ({ tripId, routeId: `route-of-${tripId}` })))
        } },
        { provide: StationMeasurementService, useValue: {
          selectedStop,
          selectStop: (stop: StopDTO) => selectedStop.set(stop),
          clearSelectedStop: () => selectedStop.set(null),
          addMeasurePoint
        } },
        { provide: VehicleLayerService, useValue: { setHighlightedRouteIds } }
      ]
    });
    service = TestBed.inject(StationTimetableService);
  });

  it('lists the stop times in time order and highlights the routes serving the station', async () => {
    service.select({ stopId: 'stop-1' });
    await settle(() => expect(service.rows()).toHaveLength(2));

    expect(service.rows().map(row => row.tripId)).toEqual(['trip-early', 'trip-late']);
    expect(service.rows()[0].routeId).toBe('route-of-trip-early');
    expect(setHighlightedRouteIds).toHaveBeenLastCalledWith(['route-of-trip-late', 'route-of-trip-early']);
  });

  it('ignores a slow timetable for a station that is no longer selected', async () => {
    const slow = new Subject<unknown>();
    stopTimesByStop['stop-1'] = slow;
    service.select({ stopId: 'stop-1' });
    TestBed.tick();
    service.select({ stopId: 'stop-2' });
    await settle(() => expect(service.rows().map(row => row.tripId)).toEqual(['trip-other']));

    slow.next([{ tripId: 'trip-late', stopSequence: 1 }]);
    slow.complete();
    TestBed.tick();

    expect(service.rows().map(row => row.tripId)).toEqual(['trip-other']);
  });

  it('clears the timetable and the highlight', async () => {
    service.select({ stopId: 'stop-1' });
    await settle(() => expect(service.rows()).toHaveLength(2));

    service.clear();
    TestBed.tick();

    expect(service.stop()).toBeNull();
    expect(service.rows()).toEqual([]);
    expect(setHighlightedRouteIds).toHaveBeenLastCalledWith([]);
  });

  it('uses a map click for a distance point only while one is being added', () => {
    service.select({ stopId: 'stop-1' });
    expect(service.addMeasurePointAt([1, 2])).toBe(false);

    service.addingMeasurePoint.set(true);
    expect(service.addMeasurePointAt([1, 2])).toBe(true);
    expect(addMeasurePoint).toHaveBeenCalledWith([1, 2]);
    expect(service.addingMeasurePoint()).toBe(false);
  });
});
