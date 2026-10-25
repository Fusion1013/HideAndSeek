import { getDistance } from 'ol/sphere';

/** A play area drawn as a box, in degrees. Create mode only draws boxes; the API takes any polygon. */
export interface AreaBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** The box as the API takes it: a closed ring of [longitude, latitude] positions, counter-clockwise. */
export function boundsToRing({ west, south, east, north }: AreaBounds): number[][] {
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

/** The box around a ring from the API; null when the ring has no usable positions. */
export function ringToBounds(ring: readonly (readonly number[])[]): AreaBounds | null {
  const positions = ring.filter(position =>
    position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]));
  if (positions.length === 0) return null;
  const longitudes = positions.map(position => position[0]);
  const latitudes = positions.map(position => position[1]);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes)
  };
}

/** Width and height in metres, measured along the box's middle. */
export function areaSize({ west, south, east, north }: AreaBounds): { width: number; height: number } {
  const middleLatitude = (south + north) / 2;
  const middleLongitude = (west + east) / 2;
  return {
    width: getDistance([west, middleLatitude], [east, middleLatitude]),
    height: getDistance([middleLongitude, south], [middleLongitude, north])
  };
}
