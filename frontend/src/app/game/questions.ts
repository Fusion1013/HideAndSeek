import { LucideCamera, LucideEqual, LucideIconData, LucideRuler, LucideTarget, LucideThermometer, LucideWaypoints } from '@lucide/angular';

import type { GameSettings, QuestionDTO, QuestionRules } from '../api/generated';
import { formatApproximateDistance, formatDistance } from '../shared/format';

export type QuestionType = QuestionDTO.TypeEnum;
/** By question type; a kind of question that is not there is as usual. */
export type QuestionSettings = GameSettings['questions'];

export interface QuestionCategory {
  id: string;
  name: string;
  plural: string;
  /** What the answer must show, for a subject of a photo. */
  rules?: string;
}

/** The categories of place a question can be about: the game's stations and the measurable map layers. */
export const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
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

function photoSubject(id: string, name: string, rules: string): QuestionCategory {
  return { id, name, plural: name, rules };
}

/** What the seekers may ask for a photo of, each with what the photo must show. */
export const PHOTO_SUBJECTS: readonly QuestionCategory[] = [
  photoSubject('tree', 'A tree', 'Must include the entire tree.'),
  photoSubject('sky', 'The sky', 'Place the phone on the ground and shoot directly up.'),
  photoSubject('selfie', 'You', 'Selfie mode, arm parallel to the ground, fully extended.'),
  photoSubject('widest_street', 'Widest street',
    'Must include both sides of the street, in your 500 m zone, somewhere you can reach safely and legally.'),
  photoSubject('tallest_structure', 'Tallest structure in your sightline',
    'Must include the top and both sides. The top must be in the top 1/3 of the frame.'),
  photoSubject('building_from_station', 'Any building visible from station',
    'Must stand directly outside a transit station entrance; with several entrances, you may choose. Must include the roof '
    + 'and both sides, with the top of the building in the top 1/3 of the frame.'),
  photoSubject('grocery_aisle', 'Grocery store aisle', 'No zoom. Stand at the end of the aisle and shoot directly down it.'),
  photoSubject('train_platform_2m', 'Train platform (2 × 2 m)', 'Must include a 2 × 2 m section with three distinct elements.'),
  photoSubject('two_buildings_2m', 'Two buildings (2 × 2 m)', 'Must include a 2 × 2 m section with three distinct elements.'),
  photoSubject('tallest_building_from_station', 'Tallest building visible from station',
    'Tallest from your perspective and sightline. Must stand directly outside a transit station entrance; with several '
    + 'entrances, you may choose. Must include the roof and both sides, with the top of the building in the top 1/3 of the frame.'),
  photoSubject('nearest_street_traced', 'Trace nearest street / path',
    'The street or path must be visible on a mapping app. Trace intersection to intersection.'),
  photoSubject('two_buildings_5ft', 'Two buildings (5′ × 5′)', 'Must include a 5′ × 5′ section with three distinct elements.'),
  photoSubject('restaurant_interior', 'Restaurant interior', 'No zoom. Must be taken from outside, through a window.'),
  photoSubject('train_platform_5ft', 'Train platform (5′ × 5′)', 'Must include a 5′ × 5′ section with three distinct elements.'),
  photoSubject('park', 'Park', 'No zoom, phone perpendicular to the ground. Must stand 5′ away from any obstruction.'),
  photoSubject('place_of_worship', 'Place of worship', 'Must include a 5′ × 5′ section with three distinct elements.'),
  photoSubject('half_mile_streets_traced', '1/2 mile of streets traced',
    'Must be continuous and include 5 turns, with no doubling back. Send it north-south oriented. The streets must appear '
    + 'on a mapping app.'),
  photoSubject('tallest_mountain_from_station', 'Tallest mountain visible from station',
    'Tallest from your perspective and sightline. Must be at 3x zoom, with the top of the mountain in the top 1/3 of the frame.'),
  photoSubject('biggest_water', 'Biggest body of water in your zone', 'Max 3x zoom. Must include either both sides of the water or the horizon.'),
  photoSubject('five_buildings', 'Five buildings', 'Must include the bottom and up to four stories.')
];

/**
 * What each kind of question needs, how it is offered, and how it may be answered. To add a kind, add it here (and
 * to the backend's QuestionType): templates offer its settings and games offer it from this list.
 */
export interface QuestionKind {
  type: QuestionType;
  label: string;
  /** What it asks, in a few words, for choosing it. */
  summary: string;
  /** Marks it on the map, where it was asked from. */
  icon: LucideIconData;
  /** The categories offered; empty when it takes none. */
  categories: readonly QuestionCategory[];
  /** What a category is to this kind of question. */
  categoryLabel: string;
  /** The distances offered, in metres; empty when it takes none. */
  distances: readonly number[];
  /** Whether it is about two points on the map, from which it takes its distance. */
  needsPath: boolean;
  /** The answers the hiders may give, with their labels. */
  choices: readonly { choice: string; label: string }[];
}

export const QUESTION_KINDS: readonly QuestionKind[] = [
  {
    type: 'MATCHING', label: 'Matching', summary: 'Is your nearest one the same as ours?', icon: LucideEqual.icon,
    categories: QUESTION_CATEGORIES, categoryLabel: 'Place', distances: [], needsPath: false,
    choices: [{ choice: 'YES', label: 'Yes' }, { choice: 'NO', label: 'No' }]
  },
  {
    type: 'MEASURING', label: 'Measuring', summary: 'Are you closer to your nearest one than we are?', icon: LucideRuler.icon,
    categories: QUESTION_CATEGORIES, categoryLabel: 'Place', distances: [], needsPath: false,
    choices: [{ choice: 'CLOSER', label: 'Closer' }, { choice: 'FURTHER', label: 'Further' }]
  },
  {
    type: 'RADAR', label: 'Radar', summary: 'Are you within a distance of us?', icon: LucideTarget.icon,
    categories: [], categoryLabel: '', distances: [500, 1000, 2000, 5000, 10_000, 25_000], needsPath: false,
    choices: [{ choice: 'YES', label: 'Yes' }, { choice: 'NO', label: 'No' }]
  },
  {
    type: 'THERMOMETER', label: 'Thermometer', summary: 'We moved: are we hotter or colder?', icon: LucideThermometer.icon,
    categories: [], categoryLabel: '', distances: [], needsPath: true,
    choices: [{ choice: 'HOTTER', label: 'Hotter' }, { choice: 'COLDER', label: 'Colder' }]
  },
  {
    type: 'TENTACLES', label: 'Tentacles', summary: 'Which one near us are you nearest to?', icon: LucideWaypoints.icon,
    categories: QUESTION_CATEGORIES, categoryLabel: 'Place', distances: [1000, 2000, 5000, 15_000], needsPath: false,
    choices: [{ choice: 'PLACE', label: 'Name the place' }, { choice: 'NONE', label: 'None within the distance' }]
  },
  {
    type: 'PHOTO', label: 'Photo', summary: 'Send us a photo of something.', icon: LucideCamera.icon,
    categories: PHOTO_SUBJECTS, categoryLabel: 'Subject', distances: [], needsPath: false,
    choices: [{ choice: 'PHOTO', label: 'Send a photo' }]
  }
];

/** How long the hiders have to answer, unless the game says otherwise; as QuestionRules on the backend. */
export const DEFAULT_ANSWER_MINUTES = 5;
export const MIN_ANSWER_MINUTES = 1;
export const MAX_ANSWER_MINUTES = 120;

const USUAL_RULES: QuestionRules = { disabled: false, disabledCategories: [], disabledDistances: [] };

export function questionRules(settings: QuestionSettings, type: QuestionType): QuestionRules {
  return settings[type] ?? USUAL_RULES;
}

/** The kinds of question a game offers, each with only the choices left to it. A kind left without any is not offered. */
export function offeredKinds(settings: QuestionSettings): QuestionKind[] {
  return QUESTION_KINDS.flatMap(kind => {
    const rules = questionRules(settings, kind.type);
    const categories = kind.categories.filter(category => !rules.disabledCategories.includes(category.id));
    const distances = kind.distances.filter(distance => !rules.disabledDistances.includes(distance));
    const emptied = categories.length < kind.categories.length && categories.length === 0
      || distances.length < kind.distances.length && distances.length === 0;
    return rules.disabled || emptied ? [] : [{ ...kind, categories, distances }];
  });
}

/** What keeps the settings from making a game, in words; null if nothing does. */
export function settingsProblem(settings: QuestionSettings): string | null {
  const offered = offeredKinds(settings).map(kind => kind.type);
  const emptied = QUESTION_KINDS.find(kind => !questionRules(settings, kind.type).disabled && !offered.includes(kind.type));
  if (emptied) return `Leave ${emptied.label} something to choose from, or turn it off.`;
  return offered.length === 0 ? 'Leave at least one kind of question available.' : null;
}

/** Radar and tentacles questions are about a circle around where the asking seeker was. */
export const CIRCLE_QUESTIONS: readonly QuestionType[] = ['RADAR', 'TENTACLES'];
/** Points around each circle, enough for it to look round at any zoom. */
export const CIRCLE_POINTS = 96;

/** The ID of the question the seekers are still choosing, which is on the map but has not been asked. */
export const PREVIEW_QUESTION_ID = 'preview';

export function questionKind(type: QuestionType): QuestionKind {
  return QUESTION_KINDS.find(kind => kind.type === type)!;
}

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
    case 'THERMOMETER': return `We moved${question.params.distanceMeters ? ` ${distance}` : ''}. Are we hotter or colder?`;
    case 'TENTACLES': return `Of the ${plural} within ${distance} of us, which are you nearest to?`;
    case 'PHOTO': return `Send a photo: ${photoSubjectOf(question)?.name ?? name}`;
  }
}

function photoSubjectOf(question: Pick<QuestionDTO, 'type' | 'params'>): QuestionCategory | undefined {
  return question.type === 'PHOTO' ? PHOTO_SUBJECTS.find(subject => subject.id === question.params.category) : undefined;
}

/** What the photo a question asks for must show; null for any other question. */
export function photoRules(question: Pick<QuestionDTO, 'type' | 'params'>): string | null {
  return photoSubjectOf(question)?.rules ?? null;
}

/** What matching and measuring compare with: "The seekers' nearest museum: Röhsska, 1.24 km away". */
export function nearestText(question: Pick<QuestionDTO, 'type' | 'params'>): string | null {
  if (question.type !== 'MATCHING' && question.type !== 'MEASURING') return null;
  const { name } = category(question.params.category);
  const nearest = question.params.nearest;
  if (!nearest) return `The seekers' nearest ${name} is not known.`;
  const place = `The seekers' nearest ${name}: ${nearest.name ?? 'Unnamed'}`;
  return question.type === 'MEASURING' ? `${place}, ${formatDistance(nearest.distanceMeters)} away` : place;
}

/** The question's kind with what became of it, as written along it on the map. */
export function mapLabel(question: QuestionDTO): string {
  const { label } = questionKind(question.type);
  return question.id === PREVIEW_QUESTION_ID ? label : `${label}: ${answerText(question)}`;
}

/** The hiders' answer in words, or what became of the question. */
export function answerText(question: QuestionDTO): string {
  if (question.status === 'EXPIRED') return 'Not answered in time';
  if (!question.answer) return 'Waiting for the hiders';
  if (question.answer.choice === 'PLACE') return question.answer.text ?? '';
  if (question.answer.choice === 'PHOTO') return 'Photo sent';
  if (question.answer.choice === 'NONE') {
    return `None within ${formatApproximateDistance(question.params.distanceMeters ?? 0)}`;
  }
  return questionKind(question.type).choices.find(choice => choice.choice === question.answer?.choice)?.label
    ?? question.answer.choice;
}
