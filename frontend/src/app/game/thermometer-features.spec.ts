import type { QuestionDTO } from '../api/generated';
import { thermometerFeatures, thermometerStyle } from './game-map.service';

const START = { longitude: 11.95, latitude: 57.68 };
const END = { longitude: 12.03, latitude: 57.73 };

function question(choice?: string): QuestionDTO {
  return {
    id: 'q1',
    type: 'THERMOMETER',
    params: { distanceMeters: 7000, start: START, end: END },
    status: choice ? 'ANSWERED' : 'PENDING',
    askedBy: 'p1',
    askedAt: '2026-10-25T12:00:00Z',
    deadlineAt: '2026-10-25T12:05:00Z',
    ...(choice ? { answer: { choice } } : {})
  };
}

function parts(choice?: string): string[] {
  return thermometerFeatures(START, END, question(choice)).map(feature => feature.get('thermometerPart') as string);
}

describe('thermometerFeatures', () => {
  it('draws the two points, the line between them and the divide', () => {
    expect(parts()).toEqual(['divide', 'path', 'point', 'point']);
  });

  it('leaves the divide to the excluded area once the hiders answer', () => {
    expect(parts('HOTTER')).toEqual(['path', 'point', 'point']);
  });

  it('dashes the divide and says it is waiting', () => {
    const divide = thermometerStyle(thermometerFeatures(START, END, question())
      .find(feature => feature.get('thermometerPart') === 'divide')!);

    expect(divide.getStroke()?.getLineDash()).toEqual([8, 6]);
    expect(divide.getText()?.getText()).toBe('Thermometer: Waiting for the hiders');
  });
});
