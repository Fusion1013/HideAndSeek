import { circular } from 'ol/geom/Polygon';
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon } from 'polygon-clipping';

import type { QuestionDTO } from '../api/generated';
import { nearerHalf } from '../shared/bisector';
import { CIRCLE_POINTS, CIRCLE_QUESTIONS } from './questions';

const HITS = ['YES', 'PLACE', 'CLOSER', 'HOTTER', 'COLDER'];

/** A thermometer's side is always one the hiders are on; the others say inside or outside the area. */
function isHit(question: QuestionDTO): boolean {
  return HITS.includes(question.answer?.choice ?? '');
}

function fromGeoJson(geoJson: string): MultiPolygon {
  const geometry = JSON.parse(geoJson) as { type: string; coordinates: unknown };
  return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as MultiPolygon;
}

/** In longitude and latitude, the area an answered question divides; null if it divides none that is known. */
function questionArea(question: QuestionDTO): MultiPolygon | null {
  const { origin, distanceMeters, start, end, nearest } = question.params;
  if (CIRCLE_QUESTIONS.includes(question.type)) {
    if (!origin || !distanceMeters) return null;
    return [circular([origin.longitude, origin.latitude], distanceMeters, CIRCLE_POINTS).getCoordinates() as MultiPolygon[number]];
  }
  if (question.type === 'THERMOMETER') {
    if (!start || !end) return null;
    const from = [start.longitude, start.latitude] as const;
    const to = [end.longitude, end.latitude] as const;
    const side = question.answer?.choice === 'HOTTER' ? nearerHalf(to, from) : nearerHalf(from, to);
    return side && [[side.map(([longitude, latitude]) => [longitude, latitude])]];
  }
  const area = question.type === 'MATCHING' ? nearest?.cell : nearest?.reach;
  return area ? fromGeoJson(area) : null;
}

/**
 * The part of the play area where the answers rule the hiders out: what is left once each hit keeps only the inside
 * of its question's area and each miss takes that area away, turned around. From the questions alone, so a replay
 * gets it the same way as the live game does. A question whose area is not known rules nothing out.
 *
 * @param boundary the play area's ring, in longitude and latitude
 * @param questions those with an answer; any others are passed over
 * @returns in longitude and latitude; empty while nothing is ruled out
 */
export function excludedArea(boundary: readonly (readonly number[])[], questions: readonly QuestionDTO[]): MultiPolygon {
  if (boundary.length < 4) return [];
  const playArea: MultiPolygon = [[boundary.map(([longitude, latitude]) => [longitude, latitude])]];
  let possible = playArea;
  for (const question of questions) {
    const area = question.answer ? questionArea(question) : null;
    if (area) possible = isHit(question) ? polygonClipping.intersection(possible, area) : polygonClipping.difference(possible, area);
  }
  return polygonClipping.difference(playArea, possible);
}
