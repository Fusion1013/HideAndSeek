import { areaSize, boundsToRing, ringToBounds } from './area-bounds';

describe('area bounds', () => {
  const bounds = { west: 11.9, south: 57.6, east: 12.1, north: 57.8 };

  it('converts a box to a closed ring and back', () => {
    const ring = boundsToRing(bounds);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ringToBounds(ring)).toEqual(bounds);
  });

  it('ignores unusable positions and gives null for an empty ring', () => {
    expect(ringToBounds([[Number.NaN, 1], [11.9, 57.6], [12.1, 57.8]])).toEqual(bounds);
    expect(ringToBounds([])).toBeNull();
  });

  it('measures the box in metres', () => {
    const { width, height } = areaSize(bounds);
    // 0.2° of latitude is about 22 km anywhere; 0.2° of longitude at 57.7°N about 12 km
    expect(height).toBeGreaterThan(22_000);
    expect(height).toBeLessThan(22_500);
    expect(width).toBeGreaterThan(11_700);
    expect(width).toBeLessThan(12_100);
  });
});
