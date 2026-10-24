import { locateVehicle, serviceDaySeconds } from './trip-progress';
import type { TripStop } from './trip-progress';

/** Stops 0.01° of longitude apart (about 600 m at this latitude), heading east. */
function stopsAlongALine(count: number): TripStop[] {
  return Array.from({ length: count }, (_, i) => ({
    stopId: `stop-${i}`,
    name: `Stop ${i}`,
    longitude: 14 + i * 0.01,
    latitude: 57.78,
    arrivalSeconds: 8 * 3600 + i * 120,
    departureSeconds: 8 * 3600 + i * 120
  }));
}

describe('locateVehicle', () => {
  it('places a vehicle between the stops it is travelling between', () => {
    const progress = locateVehicle(stopsAlongALine(4), null, [14.0125, 57.7801])!;

    expect(progress.previousIndex).toBe(1);
    expect(progress.fraction).toBeCloseTo(0.25, 1);
    expect(progress.atStopIndex).toBeNull();
    expect(progress.tripFraction).toBeCloseTo(0.4167, 1);
    expect(progress.metersToNextStop).toBeGreaterThan(400);
    expect(progress.metersToNextStop).toBeLessThan(500);
  });

  it('reports a vehicle standing at a stop', () => {
    const progress = locateVehicle(stopsAlongALine(4), null, [14.02, 57.7802])!;

    expect(progress.atStopIndex).toBe(2);
    expect(progress.previousIndex).toBe(2);
  });

  it('follows the route shape rather than straight lines between stops', () => {
    // The route detours north between the two stops; the vehicle is at the top of the detour
    const stops = stopsAlongALine(2);
    const path = [[14, 57.78], [14, 57.79], [14.01, 57.79], [14.01, 57.78]] as const;

    const progress = locateVehicle(stops, path, [14.005, 57.79])!;

    expect(progress.previousIndex).toBe(0);
    expect(progress.fraction).toBeCloseTo(0.5, 1);
  });

  it('uses the timetable to tell apart the outward and return legs of a loop', () => {
    // Out east and back west along the same street
    const out = stopsAlongALine(3);
    const back = [...out].reverse().slice(1).map((stop, i) => ({
      ...stop,
      stopId: `back-${i}`,
      arrivalSeconds: 8 * 3600 + (3 + i) * 120,
      departureSeconds: 8 * 3600 + (3 + i) * 120
    }));
    const stops = [...out, ...back];
    const halfwayBetweenStops1And0 = [14.005, 57.78] as const;

    const early = locateVehicle(stops, null, halfwayBetweenStops1And0, 8 * 3600 + 60)!;
    const late = locateVehicle(stops, null, halfwayBetweenStops1And0, 8 * 3600 + 4 * 120 + 60)!;

    expect(early.previousIndex).toBe(0);
    expect(late.previousIndex).toBe(3);
  });

  it('needs at least two stops', () => {
    expect(locateVehicle(stopsAlongALine(1), null, [14, 57.78])).toBeNull();
  });
});

describe('serviceDaySeconds', () => {
  it('moves the clock past midnight for trips scheduled after 24:00', () => {
    const lateTrip = [{ stopId: 'a', name: 'A', longitude: 0, latitude: 0, arrivalSeconds: 24.5 * 3600 }];
    const halfPastMidnight = new Date(2026, 9, 22, 0, 30).getTime();

    expect(serviceDaySeconds(halfPastMidnight, lateTrip)).toBe(24.5 * 3600);
    expect(serviceDaySeconds(halfPastMidnight, [])).toBe(0.5 * 3600);
  });
});
