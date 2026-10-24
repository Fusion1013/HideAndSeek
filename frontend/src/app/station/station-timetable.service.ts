import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Coordinate } from 'ol/coordinate';
import { map, Observable, of, switchMap } from 'rxjs';

import { StopTimeControllerService, TripControllerService } from '../api/generated';
import type { StopDTO } from '../api/generated';
import { StationMeasurementService } from '../layer/station-measurement.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { secondsOfDay } from '../shared/gtfs-time';
import { isNonEmptyString } from '../shared/guards';
import { buildStationTimetableRows, compareStationStopTimes } from './station-timetable';
import type { StationStopTimeRow } from './station-timetable';

/** How often "in 3 min" and the past/next marking are brought up to date. */
const CLOCK_TICK_MS = 30_000;

interface StationTimetableData {
  rows: StationStopTimeRow[];
  /** Routes of the trips calling at the station. */
  routeIds: string[];
}

/**
 * The selected station's timetable, and adding distance points from it. The stop itself is kept by
 * {@link StationMeasurementService}, which also draws its radius and points on the map.
 */
@Injectable({ providedIn: 'root' })
export class StationTimetableService {
  private readonly stopTimeApi = inject(StopTimeControllerService);
  private readonly tripApi = inject(TripControllerService);
  private readonly measurement = inject(StationMeasurementService);
  private readonly vehicleLayer = inject(VehicleLayerService);

  readonly stop = this.measurement.selectedStop;

  /** The current time, ticking while a station is selected. */
  readonly clock = signal(Date.now());

  /** True while the next map click adds a distance point. */
  readonly addingMeasurePoint = signal(false);

  private readonly timetable = rxResource({
    params: computed(() => this.stop()?.stopId || undefined),
    stream: ({ params: stopId }) => this.loadTimetable(stopId)
  });

  readonly rows = computed(() => buildStationTimetableRows(
    this.timetable.hasValue() ? this.timetable.value().rows : [],
    secondsOfDay(this.clock())
  ));
  readonly loading = this.timetable.isLoading;
  readonly error = computed(() => this.timetable.error() !== undefined);

  constructor() {
    // Vehicles on the routes serving the station are highlighted on the map
    effect(() => this.vehicleLayer.setHighlightedRouteIds(this.timetable.hasValue() ? this.timetable.value().routeIds : []));

    effect(onCleanup => {
      if (!this.stop()) return;
      this.clock.set(Date.now());
      const timer = setInterval(() => this.clock.set(Date.now()), CLOCK_TICK_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  select(stop: StopDTO): void {
    this.measurement.selectStop(stop);
    this.addingMeasurePoint.set(false);
  }

  clear(): void {
    this.measurement.clearSelectedStop();
    this.addingMeasurePoint.set(false);
  }

  /** Adds a distance point if one is being added; returns whether the click was used for that. */
  addMeasurePointAt(coordinate: Coordinate): boolean {
    if (!this.addingMeasurePoint() || !this.stop()) return false;
    if (this.measurement.addMeasurePoint(coordinate)) this.addingMeasurePoint.set(false);
    return true;
  }

  private loadTimetable(stopId: string): Observable<StationTimetableData> {
    return this.stopTimeApi.getStopTimesByStopId(stopId).pipe(
      switchMap(stopTimes => {
        const tripIds = [...new Set(stopTimes.map(stopTime => stopTime.tripId).filter(isNonEmptyString))];
        const trips$ = tripIds.length > 0 ? this.tripApi.getTripsByTripIds(tripIds) : of([]);
        return trips$.pipe(map(trips => {
          const tripsById = new Map(trips.filter(trip => isNonEmptyString(trip.tripId)).map(trip => [trip.tripId!, trip] as const));
          return {
            routeIds: [...new Set(trips.map(trip => trip.routeId).filter(isNonEmptyString))],
            rows: stopTimes.map((stopTime, index) => {
              const trip = tripsById.get(stopTime.tripId ?? '');
              return {
                id: `${stopTime.tripId ?? 'trip'}-${stopTime.stopSequence ?? index}`,
                tripId: stopTime.tripId,
                tripShortName: trip?.tripShortName,
                routeId: trip?.routeId,
                arrivalTime: stopTime.arrivalTime,
                departureTime: stopTime.departureTime
              };
            }).sort(compareStationStopTimes)
          };
        }));
      })
    );
  }
}
