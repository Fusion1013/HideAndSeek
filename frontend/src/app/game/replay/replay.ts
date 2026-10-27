import type { GameTimelineDTO, HidingStationDTO, PlayerDTO, QuestionDTO, TimelineEventDTO } from '../../api/generated';

export type LonLat = readonly [longitude: number, latitude: number];

/**
 * Two reports further apart than this are not joined up: the player stood still or lost their signal, and a
 * straight line between them would be a guess.
 */
export const MAX_INTERPOLATION_GAP_MS = 2 * 60_000;

/** A finished game's timeline, read once: times as numbers, ready to look up any moment. */
export interface Replay {
  readonly timeline: GameTimelineDTO;
  /** Where the slider starts and ends, in epoch milliseconds. */
  readonly start: number;
  readonly end: number;
  readonly events: readonly ReplayEvent[];
  /** The events' times, for looking them up. */
  readonly eventTimes: readonly number[];
  readonly tracks: readonly ReplayTrack[];
}

export interface ReplayEvent {
  readonly at: number;
  readonly event: TimelineEventDTO;
}

export interface ReplayTrack {
  readonly player: PlayerDTO;
  readonly times: readonly number[];
  readonly points: readonly LonLat[];
}

/** A player as the replay shows them at one moment. */
export interface ReplayPlayer {
  readonly player: PlayerDTO;
  /** Null before their first report. */
  readonly position: LonLat | null;
  /** Where they have been so far, ending at their position. */
  readonly path: readonly LonLat[];
}

/** The game at one moment. */
export interface ReplayFrame {
  readonly at: number;
  readonly players: readonly ReplayPlayer[];
  /** The questions asked so far, each as it stood then: unanswered until its answer came. */
  readonly questions: readonly QuestionDTO[];
  /** Where the hiders meant to hide then. */
  readonly hidingStation: HidingStationDTO | null;
  /** The latest event so far. */
  readonly lastEvent: ReplayEvent | null;
}

export function readReplay(timeline: GameTimelineDTO): Replay {
  const game = timeline.game;
  const events = timeline.events.map(event => ({ at: Date.parse(event.at), event }));
  const players = new Map(game.players.map(player => [player.id, player] as const));
  const tracks = timeline.tracks.flatMap(track => {
    const player = players.get(track.playerId);
    if (!player || track.points.length === 0) return [];
    return [{
      player,
      times: track.points.map(point => Date.parse(point.at)),
      points: track.points.map(point => [point.longitude, point.latitude] as const)
    }];
  });
  const firstMoments = [
    game.hidingStartedAt ? Date.parse(game.hidingStartedAt) : Infinity,
    ...events.map(event => event.at),
    ...tracks.map(track => track.times[0])
  ];
  const end = game.finishedAt ? Date.parse(game.finishedAt) : Math.max(...events.map(event => event.at), 0);
  const start = Math.min(...firstMoments, end);
  return { timeline, start, end, events, eventTimes: events.map(event => event.at), tracks };
}

export function frameAt(replay: Replay, at: number): ReplayFrame {
  const lastIndex = lastAtOrBefore(replay.eventTimes, at);
  const past = replay.events.slice(0, lastIndex + 1);

  const questions = new Map<string, QuestionDTO>();
  let hidingStation: HidingStationDTO | null = null;
  for (const { event } of past) {
    if (event.type === 'QUESTION_ASKED' && event.question) questions.set(event.question.id, asked(event.question));
    if ((event.type === 'QUESTION_ANSWERED' || event.type === 'QUESTION_EXPIRED') && event.question) {
      questions.set(event.question.id, event.question);
    }
    if (event.type === 'HIDING_STATION_CHOSEN' && event.hidingStation) hidingStation = event.hidingStation;
  }

  return {
    at,
    players: replay.tracks.map(track => playerAt(track, at)),
    questions: [...questions.values()],
    hidingStation,
    lastEvent: past.at(-1) ?? null
  };
}

/** The question as it was when asked, before any answer. */
function asked(question: QuestionDTO): QuestionDTO {
  return { ...question, status: 'PENDING', answer: undefined, answeredBy: undefined, answeredAt: undefined };
}

function playerAt(track: ReplayTrack, at: number): ReplayPlayer {
  const index = lastAtOrBefore(track.times, at);
  if (index < 0) return { player: track.player, position: null, path: [] };
  const path = track.points.slice(0, index + 1);
  let position = track.points[index];
  const nextTime = track.times[index + 1];
  if (nextTime !== undefined && nextTime - track.times[index] <= MAX_INTERPOLATION_GAP_MS) {
    const share = (at - track.times[index]) / (nextTime - track.times[index]);
    const [fromLon, fromLat] = position;
    const [toLon, toLat] = track.points[index + 1];
    position = [fromLon + (toLon - fromLon) * share, fromLat + (toLat - fromLat) * share];
    path.push(position);
  }
  return { player: track.player, position, path };
}

/** The index of the last of the ascending times that is not after `at`; -1 if there is none. */
export function lastAtOrBefore(times: readonly number[], at: number): number {
  let low = 0;
  let high = times.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= at) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
