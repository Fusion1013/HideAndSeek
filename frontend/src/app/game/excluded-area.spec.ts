import type { MultiPolygon } from 'polygon-clipping';

import type { GameTimelineDTO, QuestionDTO, QuestionParams, TimelineEventDTO } from '../api/generated';
import { excludedArea } from './excluded-area';
import { frameAt, readReplay } from './replay/replay';

const BOUNDARY = [[11.9, 57.6], [12.1, 57.6], [12.1, 57.8], [11.9, 57.8], [11.9, 57.6]];
const CENTER = { longitude: 12, latitude: 57.7 };
const WEST = [11.92, 57.7] as const;
const EAST = [12.08, 57.7] as const;
const MIDDLE = [12, 57.7] as const;
/** The western half of the play area, as an area from the server. */
const WEST_HALF = JSON.stringify({ type: 'Polygon', coordinates: [[[11.9, 57.6], [12, 57.6], [12, 57.8], [11.9, 57.8], [11.9, 57.6]]] });
const NEAREST = { name: 'Röhsska', longitude: 11.95, latitude: 57.7, distanceMeters: 500 };

function question(id: string, type: QuestionDTO.TypeEnum, params: QuestionParams, choice?: string): QuestionDTO {
  return {
    id,
    type,
    params,
    status: choice ? 'ANSWERED' : 'PENDING',
    askedBy: 'p1',
    askedAt: '2026-10-25T12:00:00Z',
    deadlineAt: '2026-10-25T12:05:00Z',
    ...(choice ? { answer: { choice } } : {})
  };
}

function contains(area: MultiPolygon, [x, y]: readonly [number, number]): boolean {
  const inRing = (ring: number[][]) => ring.reduce((inside, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    return (y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1 ? !inside : inside;
  }, false);
  return area.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}

const excluded = (...questions: QuestionDTO[]) => excludedArea(BOUNDARY, questions);
const radar = (id: string, choice?: string) => question(id, 'RADAR', { origin: CENTER, distanceMeters: 2000 }, choice);

describe('excludedArea', () => {
  it('rules nothing out without answers, or without a play area', () => {
    expect(excluded()).toEqual([]);
    expect(excluded(radar('q1'))).toEqual([]);
    expect(excluded(question('q1', 'RADAR', { origin: CENTER, distanceMeters: 2000 }))).toEqual([]);
    expect(excludedArea([], [radar('q1', 'YES')])).toEqual([]);
  });

  it('takes in everything outside a hit, and only the area of a miss', () => {
    const hit = excluded(radar('q1', 'YES'));
    expect(contains(hit, MIDDLE)).toBe(false);
    expect(contains(hit, WEST)).toBe(true);
    expect(contains(hit, EAST)).toBe(true);

    const miss = excluded(radar('q1', 'NO'));
    expect(contains(miss, MIDDLE)).toBe(true);
    expect(contains(miss, WEST)).toBe(false);
  });

  it('adds each answer to the same area', () => {
    const area = excluded(
      question('q1', 'MATCHING', { nearest: { ...NEAREST, cell: WEST_HALF } }, 'YES'),
      radar('q2', 'NO')
    );
    expect(contains(area, EAST)).toBe(true);
    expect(contains(area, MIDDLE)).toBe(true);
    expect(contains(area, WEST)).toBe(false);
  });

  it('reads tentacles like radar', () => {
    const tentacles = (choice: string) => question('q1', 'TENTACLES', { origin: CENTER, distanceMeters: 2000 }, choice);
    expect(contains(excluded(tentacles('PLACE')), WEST)).toBe(true);
    expect(contains(excluded(tentacles('NONE')), MIDDLE)).toBe(true);
    expect(contains(excluded(tentacles('NONE')), WEST)).toBe(false);
  });

  it('reads matching by the cell, and measuring by everywhere as close to a place of the kind', () => {
    const matching = (choice: string) => question('q1', 'MATCHING', { nearest: { ...NEAREST, cell: WEST_HALF } }, choice);
    expect(contains(excluded(matching('YES')), EAST)).toBe(true);
    expect(contains(excluded(matching('NO')), WEST)).toBe(true);

    const measuring = (choice: string) => question('q1', 'MEASURING', { nearest: { ...NEAREST, reach: WEST_HALF } }, choice);
    expect(contains(excluded(measuring('CLOSER')), EAST)).toBe(true);
    expect(contains(excluded(measuring('CLOSER')), WEST)).toBe(false);
    expect(contains(excluded(measuring('FURTHER')), WEST)).toBe(true);
    expect(contains(excluded(measuring('FURTHER')), EAST)).toBe(false);
  });

  it('takes the side the seekers moved away from for hotter, and the one they moved to for colder', () => {
    const start = { longitude: 11.95, latitude: 57.7 };
    const end = { longitude: 12.05, latitude: 57.7 };
    const thermometer = (choice: string) => question('q1', 'THERMOMETER', { start, end }, choice);
    expect(contains(excluded(thermometer('HOTTER')), WEST)).toBe(true);
    expect(contains(excluded(thermometer('HOTTER')), EAST)).toBe(false);
    expect(contains(excluded(thermometer('COLDER')), EAST)).toBe(true);
    expect(contains(excluded(thermometer('COLDER')), WEST)).toBe(false);
  });

  it('rules nothing out for an area it does not know', () => {
    expect(excluded(question('q1', 'MATCHING', { nearest: NEAREST }, 'YES'))).toEqual([]);
    expect(excluded(question('q1', 'MEASURING', { nearest: NEAREST }, 'CLOSER'))).toEqual([]);
    expect(excluded(question('q1', 'RADAR', { distanceMeters: 2000 }, 'YES'))).toEqual([]);
  });

  it('takes in the whole play area when the answers leave nowhere', () => {
    const area = excluded(radar('q1', 'YES'), radar('q2', 'NO'));
    expect(contains(area, MIDDLE)).toBe(true);
    expect(contains(area, WEST)).toBe(true);
  });

  it('builds up the same way through a replay, as each answer comes', () => {
    const at = (minutes: number) => Date.parse('2026-10-25T12:00:00Z') + minutes * 60_000;
    const event = (type: TimelineEventDTO.TypeEnum, minutes: number, item: QuestionDTO): TimelineEventDTO =>
      ({ type, at: new Date(at(minutes)).toISOString(), question: item });
    const first = radar('q1', 'NO');
    const second = question('q2', 'MATCHING', { nearest: { ...NEAREST, cell: WEST_HALF } }, 'YES');
    const replay = readReplay({
      game: { players: [], finishedAt: new Date(at(30)).toISOString() },
      tracks: [],
      events: [
        event('QUESTION_ASKED', 1, first),
        event('QUESTION_ANSWERED', 2, first),
        event('QUESTION_ASKED', 3, second),
        event('QUESTION_ANSWERED', 4, second)
      ]
    } as unknown as GameTimelineDTO);
    const shown = (minutes: number) => excludedArea(BOUNDARY, frameAt(replay, at(minutes)).questions);

    expect(shown(1.5)).toEqual([]);
    expect(shown(2.5)).toEqual(excluded(first));
    expect(shown(3.5)).toEqual(excluded(first));
    expect(shown(5)).toEqual(excluded(first, second));
    // Going back takes the later answer away again
    expect(contains(shown(5), EAST)).toBe(true);
    expect(contains(shown(2.5), EAST)).toBe(false);
  });
});
