import type { GameDTO, TimelineEventDTO } from '../../api/generated';
import { answerText, questionText } from '../questions';

export type TimelineEventType = TimelineEventDTO.TypeEnum;

/** How a mark on the slider looks: its colour comes from its category. */
export type MarkCategory = 'phase' | 'station' | 'question' | 'answer';

/** How the replay shows one kind of event. */
export interface TimelineEventKind {
  category: MarkCategory;
  /** What happened, in a sentence: shown as the replay reaches it, and read out. */
  describe(event: TimelineEventDTO, playerName: (playerId: string | undefined) => string, game: GameDTO): string;
}

/**
 * Every kind of event the server can put on a timeline. Keyed by the type, so a new type on the server does not
 * compile here until it is described.
 */
export const TIMELINE_EVENT_KINDS: Record<TimelineEventType, TimelineEventKind> = {
  HIDING_STARTED: {
    category: 'phase',
    describe: () => 'The game started and the hiders set off.'
  },
  HIDING_STATION_CHOSEN: {
    category: 'station',
    describe: (event, name) => `${name(event.playerId)} chose ${event.hidingStation?.station.name ?? 'a station'} to hide at.`
  },
  SEEKING_STARTED: {
    category: 'phase',
    describe: () => 'The hiding time was up and the seekers set off.'
  },
  QUESTION_ASKED: {
    category: 'question',
    describe: (event, name) => `${name(event.playerId)} asked: ${event.question ? questionText(event.question) : 'a question'}`
  },
  QUESTION_ANSWERED: {
    category: 'answer',
    describe: (event, name) => `${name(event.playerId)} answered: ${event.question ? answerText(event.question) : ''}`
  },
  QUESTION_EXPIRED: {
    category: 'answer',
    describe: () => 'The hiders did not answer in time.'
  },
  GAME_ENDED: {
    category: 'phase',
    describe: (_event, _name, game) => {
      switch (game.outcome) {
        case 'FOUND': return 'The seekers found the hiders.';
        case 'ABANDONED': return 'The game was abandoned.';
        default: return 'The host ended the game.';
      }
    }
  }
};

/** The kind of an event; one the page does not know yet (from a newer server) is shown plainly. */
export function timelineEventKind(type: string): TimelineEventKind {
  return TIMELINE_EVENT_KINDS[type as TimelineEventType] ?? { category: 'phase', describe: () => 'Something happened.' };
}
