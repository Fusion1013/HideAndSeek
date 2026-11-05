import { buildStationTimetableRows, buildStopServiceLegend } from './station-timetable';
import type { StationStopTimeRow } from './station-timetable';

describe('station timetable', () => {
  const row = (types: Pick<StationStopTimeRow, 'pickupType' | 'dropOffType'>): StationStopTimeRow => ({
    id: 'row', arrivalTime: '08:00:00', departureTime: '08:00:00', ...types
  });
  const noteOf = (types: Pick<StationStopTimeRow, 'pickupType' | 'dropOffType'>) => buildStationTimetableRows([row(types)], 0)[0];

  it.each([
    [1, 'No pickup', 'No pickup available', 'No drop off', 'No drop off available'],
    [2, 'Phone agency', 'Must phone agency to arrange pickup', 'Phone agency', 'Must phone agency to arrange drop off'],
    [3, 'Ask driver', 'Must coordinate with driver to arrange pickup', 'Ask driver', 'Must coordinate with driver to arrange drop off']
  ])('words GTFS value %i for pickups and for drop offs', (type, pickupLabel, pickupDescription, dropOffLabel, dropOffDescription) => {
    const { pickupNote, dropOffNote } = noteOf({ pickupType: type, dropOffType: type });

    expect(pickupNote).toEqual({ label: pickupLabel, description: pickupDescription });
    expect(dropOffNote).toEqual({ label: dropOffLabel, description: dropOffDescription });
  });

  it('gives regular service no label, whether 0 or empty', () => {
    const empty = { description: 'Regularly scheduled pickup' };
    expect(noteOf({ pickupType: 0 }).pickupNote).toEqual(empty);
    expect(noteOf({}).pickupNote).toEqual(empty);
    // The API sends a missing value as null
    expect(noteOf({ pickupType: null as unknown as undefined }).pickupNote).toEqual(empty);
    expect(noteOf({ dropOffType: 0 }).dropOffNote).toEqual({ description: 'Regularly scheduled drop off' });
  });

  it('does not call a value outside GTFS regular', () => {
    expect(noteOf({ pickupType: 7 }).pickupNote).toBeUndefined();
  });

  it('keys the notes in use, including regular service next to them', () => {
    expect(buildStopServiceLegend([row({ pickupType: 3, dropOffType: 1 }), row({ pickupType: 3 })])).toEqual([
      { term: 'Arrival: no note', description: 'Regularly scheduled drop off' },
      { term: 'Arrival: No drop off', description: 'No drop off available' },
      { term: 'Departure: Ask driver', description: 'Must coordinate with driver to arrange pickup' }
    ]);
  });

  it('needs no key when all service is regular', () => {
    expect(buildStopServiceLegend([row({ pickupType: 0, dropOffType: 0 }), row({})])).toEqual([]);
  });
});
