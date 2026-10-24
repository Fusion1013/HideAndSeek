/** GTFS timetable times: "HH:MM:SS" after midnight of the service day, where hours may exceed 23. */

/** Seconds after midnight for a GTFS time, or undefined when it is missing or malformed. */
export function parseGtfsTime(time: string | undefined): number | undefined {
  const match = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(time?.trim() ?? '');
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

/** Seconds after local midnight for a timestamp (epoch ms). */
export function secondsOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}
