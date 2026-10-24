/** Locates a vehicle along its trip: which stops it has passed and how far it is towards the next. */

import { secondsOfDay } from '../shared/gtfs-time';

export type LonLat = readonly [longitude: number, latitude: number];

export interface TripStop {
  stopId: string;
  name: string;
  platform?: string;
  longitude: number;
  latitude: number;
  /** Scheduled arrival, in seconds after midnight of the service day (may exceed 24 h). */
  arrivalSeconds?: number;
  /** Scheduled departure, in seconds after midnight of the service day (may exceed 24 h). */
  departureSeconds?: number;
}

export interface TripProgress {
  /** Index of the last stop reached or passed; -1 before the first stop. */
  previousIndex: number;
  /** How far the vehicle is from the previous stop towards the next one, 0–1. */
  fraction: number;
  /** The stop the vehicle is at, when it is within {@link AT_STOP_METERS} of it. */
  atStopIndex: number | null;
  /** How much of the whole trip is done, by distance, 0–1. */
  tripFraction: number;
  /** Distance to the next stop along the route, or null after the last stop. */
  metersToNextStop: number | null;
}

/** A vehicle this close to a stop, along the route, is shown as being at it. */
export const AT_STOP_METERS = 50;

/** Within this distance of the route, the first matching stretch is used, so loops resolve in trip order. */
const SNAP_METERS = 25;

/** How much a stretch far from where the timetable says the vehicle should be counts against it. */
const SCHEDULE_WEIGHT = 0.1;

/**
 * @param path    the trip's route shape; when missing, straight lines between the stops are used
 * @param nowSeconds current time in seconds after midnight, used to tell apart parts of a route that overlap
 */
export function locateVehicle(
  stops: readonly TripStop[],
  path: readonly LonLat[] | null,
  vehicle: LonLat,
  nowSeconds?: number
): TripProgress | null {
  if (stops.length < 2) return null;

  const project = projector(vehicle[1]);
  const line = (path && path.length >= 2 ? path : stops.map(stop => [stop.longitude, stop.latitude] as const)).map(project);
  const cumulative = cumulativeLengths(line);

  // Where each stop lies along the route, never going backwards
  const stopAlong: number[] = [];
  let fromSegment = 0;
  for (const stop of stops) {
    const hit = nearestOnLine(line, cumulative, project([stop.longitude, stop.latitude]), fromSegment);
    fromSegment = hit.segment;
    stopAlong.push(Math.max(hit.along, stopAlong.at(-1) ?? 0));
  }

  const expected = nowSeconds === undefined ? undefined : expectedAlong(stops, stopAlong, nowSeconds);
  const along = vehicleAlong(line, cumulative, project(vehicle), expected);

  let previousIndex = -1;
  for (let i = 0; i < stopAlong.length; i++) {
    if (stopAlong[i] <= along + 1) previousIndex = i;
  }
  const next = previousIndex + 1;
  const fraction = previousIndex < 0 || next >= stops.length
    ? 0
    : clamp((along - stopAlong[previousIndex]) / Math.max(stopAlong[next] - stopAlong[previousIndex], 1), 0, 1);

  let atStopIndex: number | null = null;
  let closest = AT_STOP_METERS;
  stopAlong.forEach((stopPosition, index) => {
    const distance = Math.abs(stopPosition - along);
    if (distance <= closest) {
      closest = distance;
      atStopIndex = index;
    }
  });

  const start = stopAlong[0];
  const end = stopAlong[stopAlong.length - 1];
  return {
    previousIndex,
    fraction,
    atStopIndex,
    tripFraction: clamp((along - start) / Math.max(end - start, 1), 0, 1),
    metersToNextStop: next < stops.length ? Math.max(stopAlong[next] - along, 0) : null
  };
}


/**
 * Seconds after midnight for a timestamp, moved to the next day when that is closer to the trip, so a trip
 * scheduled at 24:30 lines up with 00:30.
 */
export function serviceDaySeconds(timestamp: number, stops: readonly TripStop[]): number {
  const seconds = secondsOfDay(timestamp);
  const times = stops.flatMap(stop => [stop.arrivalSeconds, stop.departureSeconds]).filter(isNumber);
  if (times.length === 0) return seconds;
  const middle = (Math.min(...times) + Math.max(...times)) / 2;
  return Math.abs(seconds + 86_400 - middle) < Math.abs(seconds - middle) ? seconds + 86_400 : seconds;
}

/** Equirectangular projection to meters around a latitude: accurate enough within a city. */
function projector(latitude: number): (point: LonLat) => [number, number] {
  const metersPerDegreeLongitude = 111_320 * Math.cos(latitude * Math.PI / 180);
  return ([longitude, lat]) => [longitude * metersPerDegreeLongitude, lat * 110_540];
}

function cumulativeLengths(line: readonly (readonly [number, number])[]): number[] {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  return lengths;
}

interface LineHit {
  segment: number;
  along: number;
  distance: number;
}

function hitOnSegment(line: readonly (readonly [number, number])[], cumulative: number[], point: readonly [number, number], segment: number): LineHit {
  const [ax, ay] = line[segment];
  const [bx, by] = line[segment + 1];
  const length2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = length2 === 0 ? 0 : clamp(((point[0] - ax) * (bx - ax) + (point[1] - ay) * (by - ay)) / length2, 0, 1);
  const x = ax + t * (bx - ax);
  const y = ay + t * (by - ay);
  return {
    segment,
    along: cumulative[segment] + t * Math.sqrt(length2),
    distance: Math.hypot(point[0] - x, point[1] - y)
  };
}

/** The first stretch from `fromSegment` that passes the point, or the nearest one if none does. */
function nearestOnLine(line: readonly (readonly [number, number])[], cumulative: number[], point: readonly [number, number], fromSegment: number): LineHit {
  let best: LineHit | null = null;
  for (let segment = fromSegment; segment < line.length - 1; segment++) {
    const hit = hitOnSegment(line, cumulative, point, segment);
    if (hit.distance <= SNAP_METERS) return hit;
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best ?? { segment: fromSegment, along: cumulative[fromSegment], distance: Infinity };
}

/** The vehicle's distance along the route: the nearest stretch, favouring where the timetable puts it. */
function vehicleAlong(line: readonly (readonly [number, number])[], cumulative: number[], point: readonly [number, number], expected: number | undefined): number {
  let best: { along: number; score: number } | null = null;
  for (let segment = 0; segment < line.length - 1; segment++) {
    const hit = hitOnSegment(line, cumulative, point, segment);
    const score = hit.distance + (expected === undefined ? 0 : SCHEDULE_WEIGHT * Math.abs(hit.along - expected));
    if (!best || score < best.score) best = { along: hit.along, score };
  }
  return best?.along ?? 0;
}

/** Where the timetable says the vehicle should be now, interpolated between stops. */
function expectedAlong(stops: readonly TripStop[], stopAlong: number[], now: number): number | undefined {
  const timed = stops
    .map((stop, index) => ({ along: stopAlong[index], time: stop.departureSeconds ?? stop.arrivalSeconds }))
    .filter((entry): entry is { along: number; time: number } => entry.time !== undefined);
  if (timed.length === 0) return undefined;
  if (now <= timed[0].time) return timed[0].along;
  for (let i = 1; i < timed.length; i++) {
    if (now <= timed[i].time) {
      const span = timed[i].time - timed[i - 1].time;
      const t = span <= 0 ? 1 : (now - timed[i - 1].time) / span;
      return timed[i - 1].along + t * (timed[i].along - timed[i - 1].along);
    }
  }
  return timed[timed.length - 1].along;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
