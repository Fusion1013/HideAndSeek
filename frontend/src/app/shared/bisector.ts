/** A point on the map, as [longitude, latitude] in degrees. */
export type LonLat = readonly [number, number];
type Vector = readonly [number, number, number];

/** The Earth's mean radius, as `ol/sphere` takes it. */
const EARTH_RADIUS_METERS = 6_371_008.8;
/** How far the dividing line runs each way, and the shaded half reaches: past the edge of any play area. */
const REACH = 1_000_000 / EARTH_RADIUS_METERS;
/** Points along each way of the dividing line, enough for it to curve smoothly on the map. */
const STEPS = 64;

const degrees = (radians: number) => radians * 180 / Math.PI;
const radians = (degrees: number) => degrees * Math.PI / 180;
const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector, factor: number): Vector => [a[0] * factor, a[1] * factor, a[2] * factor];
const cross = (a: Vector, b: Vector): Vector =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function normalized(vector: Vector): Vector | null {
  const length = Math.hypot(...vector);
  return length < 1e-12 ? null : scale(vector, 1 / length);
}

function toVector([longitude, latitude]: LonLat): Vector {
  const cosLatitude = Math.cos(radians(latitude));
  return [cosLatitude * Math.cos(radians(longitude)), cosLatitude * Math.sin(radians(longitude)), Math.sin(radians(latitude))];
}

function toLonLat([x, y, z]: Vector): LonLat {
  return [degrees(Math.atan2(y, x)), degrees(Math.atan2(z, Math.hypot(x, y)))];
}

/**
 * The great circle of points equally far from both, sampled around their midpoint. On the sphere that is a plane
 * through the Earth's centre, square to the line between the two points. Null when the points coincide or are
 * opposite each other, and no one such circle exists.
 */
function dividingCircle(near: LonLat, far: LonLat): { points: Vector[]; towardsNear: Vector } | null {
  const nearVector = toVector(near);
  const farVector = toVector(far);
  const towardsNear = normalized(add(nearVector, scale(farVector, -1)));
  const middle = normalized(add(nearVector, farVector));
  if (!towardsNear || !middle) return null;

  const along = cross(towardsNear, middle);
  const points = Array.from({ length: 2 * STEPS + 1 }, (_, index) => {
    const angle = REACH * (index - STEPS) / STEPS;
    return add(scale(middle, Math.cos(angle)), scale(along, Math.sin(angle)));
  });
  return { points, towardsNear };
}

/**
 * The line through the middle of the two points and square to the line between them: everywhere on it is equally
 * far from both. Null if the points coincide.
 */
export function perpendicularBisector(start: LonLat, end: LonLat): LonLat[] | null {
  return dividingCircle(start, end)?.points.map(toLonLat) ?? null;
}

/** The ring around the side of the {@link perpendicularBisector} that is nearer to `near`. Null if the points coincide. */
export function nearerHalf(near: LonLat, far: LonLat): LonLat[] | null {
  const circle = dividingCircle(near, far);
  if (!circle) return null;
  const edge = circle.points.map(toLonLat);
  const outer = circle.points
    .map(point => add(scale(point, Math.cos(REACH)), scale(circle.towardsNear, Math.sin(REACH))))
    .map(toLonLat)
    .reverse();
  return [...edge, ...outer, edge[0]];
}
