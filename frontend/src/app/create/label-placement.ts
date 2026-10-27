/** A box in image pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A label to place next to its point. */
export interface LabelRequest {
  text: string;
  /** The point it labels (a station's marker), in image pixels. */
  x: number;
  y: number;
  /** The text's measured size. */
  width: number;
  height: number;
}

/** Where a label goes. */
export interface PlacedLabel extends Rect {
  text: string;
  /** The point it labels. */
  anchorX: number;
  anchorY: number;
  /** Placed away from its point, with a line back to it, as there was no room right next to it. */
  leader: boolean;
}

export interface PlacementOptions {
  /** The markers' radius: labels keep clear of every marker. */
  markerRadius: number;
  /** Space between a label and its marker. */
  gap: number;
  /** Labels stay inside this box (the image). */
  bounds: Rect;
  /** Areas labels must keep clear of (a title, the attribution). */
  obstacles?: readonly Rect[];
  /** How far out labels are tried before settling for the least crowded spot, in label heights. */
  maxRings?: number;
}

/** Directions around a point, clockwise from the right; the first fitting one is used. */
const DIRECTIONS = [0, 180, 315, 45, 270, 90, 225, 135].map(degrees => degrees * Math.PI / 180);
/** Further out, more directions are tried, as there is more room around the point. */
const OUTER_DIRECTIONS = Array.from({ length: 16 }, (_, index) => index * Math.PI / 8);

/**
 * Places every label, none left out: next to its point where there is room, else further out with a leader line,
 * else (when nothing is free) where it overlaps least. Labels keep clear of all markers, of each other and of the
 * obstacles where they can. The most crowded points are placed first, while they still have choices.
 */
export function placeLabels(requests: readonly LabelRequest[], options: PlacementOptions): PlacedLabel[] {
  const { markerRadius, gap, bounds } = options;
  const maxRings = options.maxRings ?? 6;
  const cellSize = Math.max(32, ...requests.map(request => Math.max(request.width, request.height)));
  const index = new GridIndex(cellSize);
  const markers = new Map(requests.map(request => {
    const marker = { x: request.x - markerRadius, y: request.y - markerRadius, width: markerRadius * 2, height: markerRadius * 2 };
    index.add(marker);
    return [request, marker] as const;
  }));
  (options.obstacles ?? []).forEach(obstacle => index.add(obstacle));
  const placed = new Map<LabelRequest, PlacedLabel>();

  for (const request of byCrowding(requests)) {
    const own = markers.get(request);
    const cost = (rect: Rect) => index.near(rect)
      .reduce((area, other) => other === own ? area : area + overlap(rect, other), 0) + outside(rect, bounds);

    let best: { rect: Rect; ring: number; cost: number } | null = null;
    for (let ring = 0; ring <= maxRings && !(best && best.cost === 0); ring++) {
      const distance = markerRadius + gap + ring * request.height * 1.2;
      for (const angle of ring === 0 ? DIRECTIONS : OUTER_DIRECTIONS) {
        const rect = besidePoint(request, distance, angle);
        const rectCost = cost(rect);
        if (!best || rectCost < best.cost) best = { rect, ring, cost: rectCost };
        if (rectCost === 0) break;
      }
    }
    const { rect, ring } = best!;
    placed.set(request, { ...rect, text: request.text, anchorX: request.x, anchorY: request.y, leader: ring > 0 });
    index.add(rect);
  }
  return requests.map(request => placed.get(request)!);
}

/** The point on a label's edge nearest to its point, where a leader line meets it. */
export function nearestEdgePoint(label: PlacedLabel): { x: number; y: number } {
  return {
    x: Math.min(Math.max(label.anchorX, label.x), label.x + label.width),
    y: Math.min(Math.max(label.anchorY, label.y), label.y + label.height)
  };
}

/** A label's box, its nearest edge at {@code distance} from the point in the direction {@code angle}. */
function besidePoint(request: LabelRequest, distance: number, angle: number): Rect {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Along the direction, the box's near side (or corner) sits at the distance; across it, it is centred
  const x = request.x + dx * distance - (dx < -0.3 ? request.width : dx > 0.3 ? 0 : request.width / 2);
  const y = request.y + dy * distance - (dy < -0.3 ? request.height : dy > 0.3 ? 0 : request.height / 2);
  return { x, y, width: request.width, height: request.height };
}

/** Points with the most neighbours first: they have the fewest free spots, so they choose before others fill them. */
function byCrowding(requests: readonly LabelRequest[]): LabelRequest[] {
  const neighbours = new Map(requests.map(request => [request, requests.filter(other => other !== request
    && Math.abs(other.x - request.x) < request.width + other.width
    && Math.abs(other.y - request.y) < (request.height + other.height) * 2).length] as const));
  return [...requests].sort((first, second) => neighbours.get(second)! - neighbours.get(first)! || first.y - second.y);
}

function overlap(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** How much of the box lies outside the bounds, weighted so that is avoided more than overlapping. */
function outside(rect: Rect, bounds: Rect): number {
  return (rect.width * rect.height - overlap(rect, bounds)) * 4;
}

/** Boxes by the grid cells they cover, so a box is only compared with those near it. */
class GridIndex {
  private readonly cells = new Map<string, Rect[]>();

  constructor(private readonly cellSize: number) {
  }

  add(rect: Rect): void {
    this.forCells(rect, key => {
      const cell = this.cells.get(key);
      if (cell) cell.push(rect); else this.cells.set(key, [rect]);
    });
  }

  /** The boxes in the cells the given box covers, each once. */
  near(rect: Rect): Rect[] {
    const found = new Set<Rect>();
    this.forCells(rect, key => this.cells.get(key)?.forEach(other => found.add(other)));
    return [...found];
  }

  private forCells(rect: Rect, visit: (key: string) => void): void {
    const left = Math.floor(rect.x / this.cellSize);
    const right = Math.floor((rect.x + rect.width) / this.cellSize);
    const top = Math.floor(rect.y / this.cellSize);
    const bottom = Math.floor((rect.y + rect.height) / this.cellSize);
    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) visit(`${column}:${row}`);
    }
  }
}
