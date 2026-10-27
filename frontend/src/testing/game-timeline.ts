import type { GameTimelineDTO, QuestionDTO } from '../app/api/generated';

/** A finished game for the replay's tests: Ada hides, Grace seeks, one radar question, found after an hour. */
export const START = Date.parse('2026-10-25T12:00:00Z');

function at(minutes: number): string {
  return new Date(START + minutes * 60_000).toISOString();
}

const RADAR: QuestionDTO = {
  id: 'q1', type: 'RADAR', params: { distanceMeters: 2000, origin: { longitude: 11.95, latitude: 57.71 } },
  status: 'ANSWERED', askedBy: 'p2', askedAt: at(40), deadlineAt: at(45),
  answer: { choice: 'YES' }, answeredBy: 'p1', answeredAt: at(42)
};

export const TIMELINE: GameTimelineDTO = {
  game: {
    id: 'g1', name: 'Göteborg', inviteCode: 'ABC234', status: 'FINISHED', outcome: 'FOUND', hidingMinutes: 30,
    hidingStartedAt: at(0), hidingEndsAt: at(30), seekingStartedAt: at(30), finishedAt: at(60),
    boundary: [], routes: [], stationCount: 2,
    players: [
      { id: 'p1', displayName: 'Ada', host: true, role: 'HIDER' },
      { id: 'p2', displayName: 'Grace', host: false, role: 'SEEKER' }
    ]
  },
  tracks: [
    { playerId: 'p1', points: [
      { longitude: 11.90, latitude: 57.70, at: at(1) },
      { longitude: 12.00, latitude: 57.70, at: at(2) },
      // A long gap: not joined up
      { longitude: 12.10, latitude: 57.70, at: at(20) }
    ] },
    { playerId: 'p2', points: [{ longitude: 11.95, latitude: 57.71, at: at(31) }] }
  ],
  events: [
    { type: 'HIDING_STARTED', at: at(0) },
    { type: 'HIDING_STATION_CHOSEN', at: at(5), playerId: 'p1', hidingStation: {
      station: { stationId: 'central', name: 'Centralstationen', longitude: 11.97, latitude: 57.7 }, chosenBy: 'p1', chosenAt: at(5)
    } },
    { type: 'HIDING_STATION_CHOSEN', at: at(10), playerId: 'p1', hidingStation: {
      station: { stationId: 'k', name: 'Korsvägen', longitude: 11.99, latitude: 57.69 }, chosenBy: 'p1', chosenAt: at(10)
    } },
    { type: 'SEEKING_STARTED', at: at(30) },
    { type: 'QUESTION_ASKED', at: at(40), playerId: 'p2', question: RADAR },
    { type: 'QUESTION_ANSWERED', at: at(42), playerId: 'p1', question: RADAR },
    { type: 'GAME_ENDED', at: at(60) }
  ]
};
