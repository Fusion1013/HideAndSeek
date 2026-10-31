import Polygon from 'ol/geom/Polygon';
import { getDistance } from 'ol/sphere';

import { LonLat, nearerHalf, perpendicularBisector } from './bisector';

const START: LonLat = [11.95, 57.68];
const END: LonLat = [12.03, 57.73];

describe('perpendicularBisector', () => {
  it('stays equally far from both points, however far it runs', () => {
    const line = perpendicularBisector(START, END)!;
    expect(line.length).toBeGreaterThan(100);
    for (const point of line) {
      expect(getDistance([...point], [...START]) - getDistance([...point], [...END])).toBeCloseTo(0, 3);
    }
  });

  it('passes through the middle of the two points', () => {
    const line = perpendicularBisector(START, END)!;
    const middle = line[(line.length - 1) / 2];
    const half = getDistance([...START], [...END]) / 2;
    expect(getDistance([...middle], [...START])).toBeCloseTo(half, 3);
  });

  it('crosses a line between the points at a right angle', () => {
    // Points due north and south of each other: the dividing line runs east and west at the middle
    const line = perpendicularBisector([12, 57], [12, 58])!;
    const middle = (line.length - 1) / 2;
    expect(line[middle][0]).toBeCloseTo(12, 6);
    expect(line[middle][1]).toBeCloseTo(57.5, 6);
    expect(line[middle + 1][1]).toBeCloseTo(57.5, 2);
    expect(Math.abs(line[middle + 1][0] - 12)).toBeGreaterThan(0.1);
  });

  it('has no line for a single point', () => {
    expect(perpendicularBisector(START, START)).toBeNull();
    expect(nearerHalf(START, START)).toBeNull();
  });
});

describe('nearerHalf', () => {
  it('holds the nearer point and not the further one', () => {
    const toEnd = new Polygon([nearerHalf(END, START)!.map(point => [...point])]);
    expect(toEnd.intersectsCoordinate([...END])).toBe(true);
    expect(toEnd.intersectsCoordinate([...START])).toBe(false);

    const toStart = new Polygon([nearerHalf(START, END)!.map(point => [...point])]);
    expect(toStart.intersectsCoordinate([...START])).toBe(true);
    expect(toStart.intersectsCoordinate([...END])).toBe(false);
  });

  it('is a closed ring', () => {
    const ring = nearerHalf(END, START)!;
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });
});
