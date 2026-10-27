import { nearestEdgePoint, placeLabels, PlacedLabel, Rect } from './label-placement';

const BOUNDS: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
const OPTIONS = { markerRadius: 6, gap: 2, bounds: BOUNDS };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function marker(x: number, y: number): Rect {
  return { x: x - OPTIONS.markerRadius, y: y - OPTIONS.markerRadius, width: OPTIONS.markerRadius * 2, height: OPTIONS.markerRadius * 2 };
}

function noneOverlap(labels: readonly PlacedLabel[], points: readonly { x: number; y: number }[]): boolean {
  return labels.every((label, index) =>
    labels.every((other, otherIndex) => otherIndex === index || !overlaps(label, other))
    && points.every((point, pointIndex) => pointIndex === index || !overlaps(label, marker(point.x, point.y))));
}

describe('placeLabels', () => {
  it('puts a lone label right beside its point', () => {
    const [label] = placeLabels([{ text: 'Korsvägen', x: 500, y: 500, width: 80, height: 16 }], OPTIONS);
    expect(label.leader).toBe(false);
    expect(label.x).toBe(500 + 6 + 2);
    expect(label.y).toBe(500 - 8);
  });

  it('labels every point of a crowded cluster without overlaps, reaching out with leader lines', () => {
    // Twelve stations within 40 px of each other, as at a large interchange
    const points = Array.from({ length: 12 }, (_, index) => ({
      x: 500 + (index % 4) * 12, y: 500 + Math.floor(index / 4) * 12
    }));
    const labels = placeLabels(points.map((point, index) => ({ text: `Station ${index}`, ...point, width: 70, height: 16 })), OPTIONS);

    expect(labels).toHaveLength(12);
    expect(labels.map(label => label.text)).toEqual(points.map((_, index) => `Station ${index}`));
    expect(noneOverlap(labels, points)).toBe(true);
    expect(labels.some(label => label.leader)).toBe(true);
    for (const label of labels) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(1000);
    }
  });

  it('keeps clear of obstacles and the edges', () => {
    const title: Rect = { x: 0, y: 0, width: 300, height: 60 };
    const [corner] = placeLabels([{ text: 'Centralen', x: 10, y: 30, width: 80, height: 16 }], { ...OPTIONS, obstacles: [title] });
    expect(overlaps(corner, title)).toBe(false);
    expect(corner.x).toBeGreaterThanOrEqual(0);
    expect(corner.y).toBeGreaterThanOrEqual(0);
  });

  it('still places every label when there is no free spot at all, where it overlaps least', () => {
    const tight = { ...OPTIONS, bounds: { x: 0, y: 0, width: 120, height: 60 }, maxRings: 1 };
    const points = Array.from({ length: 8 }, (_, index) => ({ x: 20 + index * 10, y: 30 }));
    const labels = placeLabels(points.map((point, index) => ({ text: `S${index}`, ...point, width: 60, height: 16 })), tight);
    expect(labels).toHaveLength(8);
    expect(labels.every(label => Number.isFinite(label.x) && Number.isFinite(label.y))).toBe(true);
  });

  it('places a thousand labels quickly', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ x: (index * 37) % 1000, y: (index * 91) % 1000 }));
    const started = performance.now();
    placeLabels(points.map((point, index) => ({ text: `${index}`, ...point, width: 60, height: 14 })), OPTIONS);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('ends a leader line at the label edge nearest its point', () => {
    const label: PlacedLabel = { text: 'X', x: 100, y: 50, width: 40, height: 10, anchorX: 80, anchorY: 80, leader: true };
    expect(nearestEdgePoint(label)).toEqual({ x: 100, y: 60 });
  });
});
