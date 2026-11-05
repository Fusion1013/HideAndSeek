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
  /** GTFS pickup_type; empty means regularly scheduled. */
  pickupType?: number;
  /** GTFS drop_off_type; empty means regularly scheduled. */
  dropOffType?: number;
}

/** How a trip takes passengers on or lets them off at a stop. */
export interface StopServiceNote {
  /** The few words shown in a timetable row. Regular service has none, as it needs no note. */
  label?: string;
  description: string;
}

export interface StationTimetableRow extends StationStopTimeRow {
  status: 'past' | 'next' | 'upcoming' | 'untimed';
  relativeTime: string;
  /** The row to scroll into view: the next departure, or the latest one if none are left today. */
  isTimeAnchor: boolean;
  pickupNote?: StopServiceNote;
  dropOffNote?: StopServiceNote;
}

/** One line of the key below the timetable. */
export interface StopServiceLegendEntry {
  term: string;
  description: string;
}

/** Index is the GTFS value. Anything outside the GTFS values has no meaning to show. */
function stopServiceNotes(service: string): StopServiceNote[] {
  return [
    { description: `Regularly scheduled ${service}` },
    { label: `No ${service}`, description: `No ${service} available` },
    { label: 'Phone agency', description: `Must phone agency to arrange ${service}` },
    { label: 'Ask driver', description: `Must coordinate with driver to arrange ${service}` }
  ];
}

const PICKUP_NOTES = stopServiceNotes('pickup');
const DROP_OFF_NOTES = stopServiceNotes('drop off');

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
    return {
      ...row,
      status,
      relativeTime,
      isTimeAnchor: row.id === anchorId,
      pickupNote: PICKUP_NOTES[row.pickupType ?? 0],
      dropOffNote: DROP_OFF_NOTES[row.dropOffType ?? 0]
    };
  });
}

/** Spells out the notes in use, drop offs first as they sit under the arrival time. Empty if all service is regular. */
export function buildStopServiceLegend(rows: readonly StationStopTimeRow[]): StopServiceLegendEntry[] {
  const dropOffTypes = new Set(rows.map(row => row.dropOffType ?? 0));
  const pickupTypes = new Set(rows.map(row => row.pickupType ?? 0));
  if (![...dropOffTypes, ...pickupTypes].some(type => PICKUP_NOTES[type]?.label)) return [];

  const entries = (column: string, notes: StopServiceNote[], types: Set<number>) => notes
    .filter((_, type) => types.has(type))
    .map(note => ({ term: `${column}: ${note.label ?? 'no note'}`, description: note.description }));
  return [...entries('Arrival', DROP_OFF_NOTES, dropOffTypes), ...entries('Departure', PICKUP_NOTES, pickupTypes)];
}
