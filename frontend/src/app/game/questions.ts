import type { QuestionDTO } from '../api/generated';
import { formatApproximateDistance } from '../shared/format';

export type QuestionType = QuestionDTO.TypeEnum;

/** What each kind of question needs, how it is offered, and how it may be answered. */
export interface QuestionKind {
  type: QuestionType;
  label: string;
  /** What it asks, in a few words, for choosing it. */
  summary: string;
  needsCategory: boolean;
  /** The distances offered, in metres; empty when it takes none. */
  distances: readonly number[];
  /** The answers the hiders may give, with their labels. */
  choices: readonly { choice: string; label: string }[];
}

export const QUESTION_KINDS: readonly QuestionKind[] = [
  {
    type: 'MATCHING', label: 'Matching', summary: 'Is your nearest one the same as ours?',
    needsCategory: true, distances: [],
    choices: [{ choice: 'YES', label: 'Yes' }, { choice: 'NO', label: 'No' }]
  },
  {
    type: 'MEASURING', label: 'Measuring', summary: 'Are you closer to your nearest one than we are?',
    needsCategory: true, distances: [],
    choices: [{ choice: 'CLOSER', label: 'Closer' }, { choice: 'FURTHER', label: 'Further' }]
  },
  {
    type: 'RADAR', label: 'Radar', summary: 'Are you within a distance of us?',
    needsCategory: false, distances: [500, 1000, 2000, 5000, 10_000, 25_000],
    choices: [{ choice: 'YES', label: 'Yes' }, { choice: 'NO', label: 'No' }]
  },
  {
    type: 'THERMOMETER', label: 'Thermometer', summary: 'We moved: are we hotter or colder?',
    needsCategory: false, distances: [500, 1000, 3000, 10_000],
    choices: [{ choice: 'HOTTER', label: 'Hotter' }, { choice: 'COLDER', label: 'Colder' }]
  },
  {
    type: 'TENTACLES', label: 'Tentacles', summary: 'Which one near us are you nearest to?',
    needsCategory: true, distances: [1000, 2000, 5000, 15_000],
    choices: [{ choice: 'PLACE', label: 'Name the place' }, { choice: 'NONE', label: 'None within the distance' }]
  }
];

export function questionKind(type: QuestionType): QuestionKind {
  return QUESTION_KINDS.find(kind => kind.type === type)!;
}

/** The categories of place a question can be about: the game's stations and the measurable map layers. */
export const QUESTION_CATEGORIES: readonly { id: string; name: string; plural: string }[] = [
  { id: 'game_station', name: 'station', plural: 'stations' },
  { id: 'rail_station', name: 'rail station', plural: 'rail stations' },
  { id: 'high_speed_rail', name: 'high-speed rail line', plural: 'high-speed rail lines' },
  { id: 'airports', name: 'airport', plural: 'airports' },
  { id: 'parks', name: 'park', plural: 'parks' },
  { id: 'museums', name: 'museum', plural: 'museums' },
  { id: 'libraries', name: 'library', plural: 'libraries' },
  { id: 'hospitals', name: 'hospital', plural: 'hospitals' },
  { id: 'movie_theatres', name: 'movie theatre', plural: 'movie theatres' },
  { id: 'zoos', name: 'zoo', plural: 'zoos' },
  { id: 'aquariums', name: 'aquarium', plural: 'aquariums' },
  { id: 'golf_courses', name: 'golf course', plural: 'golf courses' },
  { id: 'mountains', name: 'mountain', plural: 'mountains' },
  { id: 'foreign_consulates', name: 'foreign consulate', plural: 'foreign consulates' }
];

function category(id: string | undefined): { name: string; plural: string } {
  const known = QUESTION_CATEGORIES.find(candidate => candidate.id === id);
  const name = id?.replaceAll('_', ' ') ?? 'place';
  return known ?? { name, plural: name };
}

/** The question as the seekers asked it: "Are you within 2.0 km of us?" */
export function questionText(question: Pick<QuestionDTO, 'type' | 'params'>): string {
  const { name, plural } = category(question.params.category);
  const distance = formatApproximateDistance(question.params.distanceMeters ?? 0);
  switch (question.type) {
    case 'MATCHING': return `Is your nearest ${name} the same as ours?`;
    case 'MEASURING': return `Are you closer to your nearest ${name} than we are to ours?`;
    case 'RADAR': return `Are you within ${distance} of us?`;
    case 'THERMOMETER': return `We moved ${distance}. Are we hotter or colder?`;
    case 'TENTACLES': return `Of the ${plural} within ${distance} of us, which are you nearest to?`;
  }
}

/** The hiders' answer in words, or what became of the question. */
export function answerText(question: QuestionDTO): string {
  if (question.status === 'EXPIRED') return 'Not answered in time';
  if (!question.answer) return 'Waiting for the hiders';
  if (question.answer.choice === 'PLACE') return question.answer.text ?? '';
  if (question.answer.choice === 'NONE') {
    return `None within ${formatApproximateDistance(question.params.distanceMeters ?? 0)}`;
  }
  return questionKind(question.type).choices.find(choice => choice.choice === question.answer?.choice)?.label
    ?? question.answer.choice;
}
