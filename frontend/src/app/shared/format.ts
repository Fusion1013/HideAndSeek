/** Formatting shared by the map's panels and labels. */

/** A measured distance: "842 m" or "12.35 km". */
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

/** A distance for glancing at, rounded so it does not flicker as a vehicle moves: "330 m" or "1.4 km". */
export function formatApproximateDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

/** A time of day from seconds after midnight: "14:05" or "14:05:30". Wraps past midnight. */
export function formatClock(seconds: number | undefined, withSeconds = false): string {
  if (seconds === undefined || Number.isNaN(seconds)) return '';
  const daySeconds = ((seconds % 86_400) + 86_400) % 86_400;
  const parts = [Math.floor(daySeconds / 3600), Math.floor(daySeconds / 60) % 60];
  if (withSeconds) parts.push(Math.floor(daySeconds) % 60);
  return parts.map(part => String(part).padStart(2, '0')).join(':');
}

/** A rounded-up duration: "<1 min", "14 min" or "1 hr 14 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

/** How long ago something happened, rounded down: "just now", "4 min ago" or "1 hr 5 min ago". */
export function formatAge(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min ago` : `${hours} hr ago`;
}
