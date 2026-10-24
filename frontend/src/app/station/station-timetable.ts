/** A station's timetable: every trip calling there, ordered by time and marked relative to now. */

import { formatDuration } from '../shared/format';
import { parseGtfsTime } from '../shared/gtfs-time';

export interface StationStopTimeRow {
  id: string;
  tripId?: string;
  /** The trip's own short name, when the timetable has one. */
  tripShortName?: string;
  routeId?: string;
  arrivalTime?: string;
  departureTime?: string;
}

export interface StationTimetableRow extends StationStopTimeRow {
  status: 'past' | 'next' | 'upcoming' | 'untimed';
  relativeTime: string;
  /** The row to scroll into view: the next departure, or the latest one if none are left today. */
  isTimeAnchor: boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Seconds after midnight, with untimed stops sorted last. */
function timeOrLast(time: string | undefined): number {
  return parseGtfsTime(time) ?? Number.POSITIVE_INFINITY;
}

export function compareStationStopTimes(first: StationStopTimeRow, second: StationStopTimeRow): number {
  return timeOrLast(first.arrivalTime ?? first.departureTime) - timeOrLast(second.arrivalTime ?? second.departureTime)
    || collator.compare(first.tripShortName ?? first.tripId ?? '', second.tripShortName ?? second.tripId ?? '');
}

/** @param currentTime seconds after local midnight */
export function buildStationTimetableRows(rows: readonly StationStopTimeRow[], currentTime: number): StationTimetableRow[] {
  const departures = rows.map(row => ({ row, seconds: timeOrLast(row.departureTime ?? row.arrivalTime) }))
    .filter(entry => Number.isFinite(entry.seconds));
  const futureDepartures = departures.filter(entry => entry.seconds >= currentTime)
    .sort((first, second) => first.seconds - second.seconds);
  const pastDepartures = departures.filter(entry => entry.seconds < currentTime)
    .sort((first, second) => second.seconds - first.seconds);
  const nextId = futureDepartures[0]?.row.id;
  const anchorId = nextId ?? pastDepartures[0]?.row.id;

  return rows.map(row => {
    const departureTime = timeOrLast(row.departureTime ?? row.arrivalTime);
    const arrivalTime = timeOrLast(row.arrivalTime);
    const isPast = departureTime < currentTime;
    const status: StationTimetableRow['status'] = !Number.isFinite(departureTime)
      ? 'untimed'
      : isPast ? 'past' : row.id === nextId ? 'next' : 'upcoming';
    const relativeTime = isPast
      ? `${formatDuration(currentTime - departureTime)} ago`
      : Number.isFinite(arrivalTime) && arrivalTime >= currentTime
        ? `in ${formatDuration(arrivalTime - currentTime)}`
        : Number.isFinite(departureTime)
          ? `in ${formatDuration(departureTime - currentTime)}`
          : '—';
    return { ...row, status, relativeTime, isTimeAnchor: row.id === anchorId };
  });
}
