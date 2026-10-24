import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { ShapeControllerService, StopTimeControllerService, TripControllerService } from '../api/generated';
import type { ShapePointDTO, StopTimeDTO, TripDTO } from '../api/generated';

export interface VehicleTripData {
  trip: TripDTO | undefined;
  /** The trip's stops in the order they are served. */
  stopTimes: StopTimeDTO[];
  /** The route shape in drawing order; empty when neither the trip nor its route has one. */
  shape: ShapePointDTO[];
}

/** Loads what is needed to show a vehicle's trip: the trip itself, its stop times and its route shape. */
@Injectable({ providedIn: 'root' })
export class VehicleTripService {
  private readonly tripApi = inject(TripControllerService);
  private readonly stopTimeApi = inject(StopTimeControllerService);
  private readonly shapeApi = inject(ShapeControllerService);

  load(tripId: string): Observable<VehicleTripData> {
    return forkJoin({
      trips: this.tripApi.getTripsByTripIds([tripId]),
      stopTimes: this.stopTimeApi.getStopTimesByTripIds([tripId])
    }).pipe(
      switchMap(({ trips, stopTimes }) => {
        const trip = trips.find(candidate => candidate.tripId === tripId);
        return this.shapeIdFor(trip).pipe(
          switchMap(shapeId => shapeId ? this.shapeApi.getShapesBatch([shapeId]) : of([])),
          map(shape => ({
            trip,
            stopTimes: stopTimes
              .filter(stopTime => stopTime.tripId === tripId)
              .sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0)),
            shape: [...shape].sort((a, b) => (a.shapePtSequence ?? 0) - (b.shapePtSequence ?? 0))
          }))
        );
      })
    );
  }

  /** The trip's own shape, or when it has none, the shape of another trip on the same route. */
  private shapeIdFor(trip: TripDTO | undefined): Observable<string | undefined> {
    if (trip?.shapeId) return of(trip.shapeId);
    if (!trip?.routeId) return of(undefined);
    return this.tripApi.getTripsByRouteId(trip.routeId).pipe(
      map(routeTrips => routeTrips.find(routeTrip => routeTrip.shapeId)?.shapeId)
    );
  }
}
