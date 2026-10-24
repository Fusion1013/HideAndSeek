import { formatApproximateDistance, formatClock, formatDistance, formatDuration } from './format';
import { parseGtfsTime, secondsOfDay } from './gtfs-time';
import { isFiniteNumber, isNonEmptyString } from './guards';

describe('format', () => {
  it('formats distances', () => {
    expect(formatDistance(842.4)).toBe('842 m');
    expect(formatDistance(12345)).toBe('12.35 km');
    expect(formatApproximateDistance(334)).toBe('330 m');
    expect(formatApproximateDistance(1449)).toBe('1.4 km');
  });

  it('formats clock times, wrapping past midnight', () => {
    expect(formatClock(8 * 3600 + 5 * 60 + 30)).toBe('08:05');
    expect(formatClock(8 * 3600 + 5 * 60 + 30, true)).toBe('08:05:30');
    expect(formatClock(24.5 * 3600)).toBe('00:30');
    expect(formatClock(undefined)).toBe('');
  });

  it('formats durations', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(0)).toBe('<1 min');
    expect(formatDuration(74 * 60)).toBe('1 hr 14 min');
    expect(formatDuration(120 * 60)).toBe('2 hr');
  });
});

describe('gtfs-time', () => {
  it('parses times past midnight of the service day', () => {
    expect(parseGtfsTime('08:05:30')).toBe(8 * 3600 + 5 * 60 + 30);
    expect(parseGtfsTime('25:10:00')).toBe(25 * 3600 + 10 * 60);
    expect(parseGtfsTime('8:05')).toBe(8 * 3600 + 5 * 60);
    expect(parseGtfsTime('')).toBeUndefined();
    expect(parseGtfsTime(undefined)).toBeUndefined();
  });

  it('gives seconds after local midnight', () => {
    expect(secondsOfDay(new Date(2026, 9, 22, 1, 2, 3).getTime())).toBe(3723);
  });
});

describe('guards', () => {
  it('tells non-empty strings and finite numbers apart', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isFiniteNumber(1.5)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });
});
