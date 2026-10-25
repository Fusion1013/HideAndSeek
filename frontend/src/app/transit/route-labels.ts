import type { AgencyRouteDTO } from '../api/generated';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Sorts text the way people expect: case-insensitive, with "2" before "10". */
export const compareText = collator.compare;

/** GTFS route_type values, including the common extended ones. */
const ROUTE_TYPE_LABELS: Record<string, string> = {
  '0': 'Tram',
  '1': 'Subway',
  '2': 'Rail',
  '3': 'Bus',
  '4': 'Ferry',
  '5': 'Cable tram',
  '6': 'Aerial lift',
  '7': 'Funicular',
  '11': 'Trolleybus',
  '12': 'Monorail',
  // Extended types (https://developers.google.com/transit/gtfs/reference/extended-route-types), as Trafiklab uses
  '100': 'Rail',
  '101': 'High-speed rail',
  '102': 'Long-distance rail',
  '106': 'Regional rail',
  '109': 'Suburban rail',
  '401': 'Metro',
  '700': 'Bus',
  '702': 'Express bus',
  '715': 'Demand-responsive bus',
  '900': 'Tram',
  '1000': 'Water transport',
  '1200': 'Ferry',
  '1501': 'Communal taxi'
};

export function routeTypeLabel(routeType: string | undefined): string {
  return routeType ? ROUTE_TYPE_LABELS[routeType] ?? `Route type ${routeType}` : 'Unknown type';
}

/** The route's own name: its short name where it has one ("16"), otherwise its long name or id. */
export function routeName(route: AgencyRouteDTO): string {
  return route.routeShortName || route.routeLongName || route.routeId || '';
}

/** The route as listed: "Västtrafik - 16". */
export function routeListLabel(route: AgencyRouteDTO): string {
  return route.agencyName ? `${route.agencyName} - ${routeName(route)}` : routeName(route);
}

export function compareRoutes(first: AgencyRouteDTO, second: AgencyRouteDTO): number {
  return compareText(routeListLabel(first), routeListLabel(second))
    || (first.routeId ?? '').localeCompare(second.routeId ?? '');
}

/** Lower-cased and without accents, so "ALPHA" finds "Alpha" and "malmo" finds "Malmö". */
export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
