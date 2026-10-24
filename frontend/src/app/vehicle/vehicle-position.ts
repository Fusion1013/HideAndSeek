import type { VehiclePosition } from '../api/generated';
import { isFiniteNumber, isNonEmptyString } from '../shared/guards';

/** A vehicle with a usable position, so it can be drawn and focused on the map. */
export function isMappableVehicle(value: unknown): value is VehiclePosition {
  if (typeof value !== 'object' || value === null) return false;
  const vehicle = value as VehiclePosition;
  return isFiniteNumber(vehicle.longitude) && isFiniteNumber(vehicle.latitude);
}

/** Identifies a vehicle across position updates: by vehicle id where the feed has one. */
export function vehicleKey(vehicle: VehiclePosition): string {
  if (isNonEmptyString(vehicle.id)) return `id:${vehicle.id}`;
  if (isNonEmptyString(vehicle.tripId)) return `trip:${vehicle.tripId}`;
  return `position:${vehicle.routeId ?? ''}:${vehicle.latitude}:${vehicle.longitude}`;
}
