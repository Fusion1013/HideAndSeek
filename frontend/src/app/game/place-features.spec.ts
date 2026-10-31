import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type Polygon from 'ol/geom/Polygon';
import { fromLonLat } from 'ol/proj';
import type { Icon, Style } from 'ol/style';

import type { QuestionDTO, QuestionParams } from '../api/generated';

import { placeFeatures, questionPinStyle, questionStyle } from './game-map.service';
import { QUESTION_KINDS } from './questions';

const ORIGIN = { longitude: 11.97, latitude: 57.7 };
const CELL = JSON.stringify({ type: 'Polygon', coordinates: [[[11.9, 57.6], [12.1, 57.6], [12.1, 57.8], [11.9, 57.8], [11.9, 57.6]]] });
const NEAREST = { name: 'Röhsska', longitude: 11.98, latitude: 57.7, distanceMeters: 595, cell: CELL };

function question(type: QuestionDTO.TypeEnum, params: QuestionParams, choice?: string, position?: QuestionDTO['answer']): QuestionDTO {
  return {
    id: 'q1',
    type,
    params: { category: 'museums', origin: ORIGIN, ...params },
    status: choice ? 'ANSWERED' : 'PENDING',
    askedBy: 'p1',
    askedAt: '2026-10-25T12:00:00Z',
    deadlineAt: '2026-10-25T12:05:00Z',
    ...(choice ? { answer: { choice, ...position } } : {})
  };
}

const parts = (features: Feature<Geometry>[]) => features.map(feature => feature.get('placePart') as string | undefined);

describe('questionPinStyle', () => {
  const image = (type: QuestionDTO.TypeEnum) => decodeURIComponent((questionPinStyle({ type }).getImage() as Icon).getSrc()!);

  it('marks every kind of question with a pin of its own', () => {
    const images = QUESTION_KINDS.map(kind => image(kind.type));
    expect(new Set(images).size).toBe(QUESTION_KINDS.length);
  });

  it('draws the kind\'s icon as a valid image, on the same pin for all', () => {
    for (const kind of QUESTION_KINDS) {
      const svg = new DOMParser().parseFromString(image(kind.type).replace('data:image/svg+xml,', ''), 'image/svg+xml');
      expect(svg.querySelector('parsererror')).toBeNull();
      expect(svg.querySelector('circle')?.getAttribute('fill')).toBe('#7b3fa0');
      expect(svg.querySelector('g')?.children).toHaveLength(kind.icon.node.length);
      expect(svg.querySelector('g [key]')).toBeNull();
    }
  });
});

describe('placeFeatures', () => {
  it('shows matching by the seekers\' nearest place, the way to it and the area nearest it', () => {
    const features = placeFeatures(question('MATCHING', { nearest: NEAREST }));
    expect(parts(features)).toEqual([undefined, 'link', 'pin']);
    expect((features[0].getGeometry() as Polygon).intersectsCoordinate(fromLonLat([12.05, 57.75]))).toBe(true);
    expect((features[0].getGeometry() as Polygon).intersectsCoordinate(fromLonLat([12.2, 57.75]))).toBe(false);
    expect(features[0].get('question').type).toBe('MATCHING');
    expect(features[2].get('label')).toBe('Röhsska');
  });

  it('leaves out the area when none was built, and the way there without a position', () => {
    expect(parts(placeFeatures(question('MATCHING', { nearest: { ...NEAREST, cell: undefined } })))).toEqual(['link', 'pin']);
    expect(parts(placeFeatures(question('MATCHING', { origin: undefined, nearest: { ...NEAREST, cell: undefined } })))).toEqual(['pin']);
  });

  it('shows measuring by everywhere as close to a place as the seekers were', () => {
    const features = placeFeatures(question('MEASURING', { nearest: { ...NEAREST, cell: undefined, reach: CELL } }));
    expect(parts(features)).toEqual([undefined, 'link', 'pin']);
    expect(features[1].get('label')).toBe('595 m');
    expect((features[0].getGeometry() as Polygon).intersectsCoordinate(fromLonLat([12.05, 57.75]))).toBe(true);
  });

  it('leaves the area to the excluded area once the hiders answer, and keeps the place', () => {
    expect(parts(placeFeatures(question('MATCHING', { nearest: NEAREST }, 'YES')))).toEqual(['link', 'pin']);
    expect(parts(placeFeatures(question('MEASURING', { nearest: { ...NEAREST, reach: CELL } }, 'FURTHER')))).toEqual(['link', 'pin']);
  });

  it('dashes the area while waiting', () => {
    const [area, , pin] = placeFeatures(question('MATCHING', { nearest: NEAREST })).map(feature => questionStyle(feature) as Style);
    expect(area.getStroke()?.getLineDash()).toEqual([8, 6]);
    expect(area.getText()?.getText()).toBe('Matching: Waiting for the hiders');
    expect(pin.getText()?.getText()).toBe('Röhsska');
  });

  it('draws nothing of its own for a question without a place', () => {
    expect(placeFeatures(question('MATCHING', {}))).toEqual([]);
    expect(placeFeatures(question('RADAR', { distanceMeters: 1000 }))).toEqual([]);
  });

  it('pins the place the hiders named in answer to tentacles, once it is on the map', () => {
    const params = { distanceMeters: 2000 };
    expect(placeFeatures(question('TENTACLES', params))).toEqual([]);
    expect(placeFeatures(question('TENTACLES', params, 'PLACE', { choice: 'PLACE', text: 'The old mill' }))).toEqual([]);

    const [pin] = placeFeatures(question('TENTACLES', params, 'PLACE', {
      choice: 'PLACE', text: 'Röhsska', position: { longitude: 11.98, latitude: 57.7 }
    }));
    expect(pin.get('placePart')).toBe('pin');
    expect(pin.get('label')).toBe('Röhsska');
  });
});
