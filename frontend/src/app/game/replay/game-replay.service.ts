import { computed, effect, inject, Injectable, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { GameTimelineControllerService } from '../../api/generated';
import { GameSessionService } from '../game-session.service';
import { frameAt, lastAtOrBefore, readReplay } from './replay';
import { timelineEventKind } from './timeline-events';

/** How fast the replay plays: game time per second of playing. */
export const REPLAY_SPEEDS = [
  { label: '30 s per second', factor: 30 },
  { label: '1 min per second', factor: 60 },
  { label: '2 min per second', factor: 120 },
  { label: '5 min per second', factor: 300 },
  { label: '10 min per second', factor: 600 }
] as const;

/** How often a playing replay moves on, in milliseconds. */
export const PLAY_TICK_MS = 100;

/**
 * The replay of a finished game: its timeline, the moment shown, and playing it through. The map and the slider
 * both show the frame at that moment. One per game page; it loads once the game is over.
 */
@Injectable()
export class GameReplayService {
  private readonly session = inject(GameSessionService);
  private readonly timelineApi = inject(GameTimelineControllerService);

  private readonly timeline = rxResource({
    params: () => {
      const game = this.session.game();
      return this.session.access() === 'ok' && game?.status === 'FINISHED' ? game.id : undefined;
    },
    stream: ({ params: gameId }) => this.timelineApi.getGameTimeline(gameId).pipe(map(readReplay))
  });

  readonly replay = computed(() => this.timeline.hasValue() ? this.timeline.value() : null);
  /** Shown in place of the game as it is now. */
  readonly active = computed(() => this.replay() !== null);
  readonly loadFailed = computed(() => this.timeline.status() === 'error');

  /** The moment shown, in epoch milliseconds. Starts at the end, with every path complete. */
  readonly cursor = linkedSignal(() => this.replay()?.end ?? 0);
  readonly playing = signal(false);
  readonly speed = signal<number>(REPLAY_SPEEDS[1].factor);

  readonly frame = computed(() => {
    const replay = this.replay();
    return replay ? frameAt(replay, this.cursor()) : null;
  });

  /** The latest event so far, in words. */
  readonly currentEvent = computed(() => {
    const event = this.frame()?.lastEvent?.event;
    const game = this.session.game();
    return event && game ? timelineEventKind(event.type).describe(event, this.playerName, game) : '';
  });

  /** The events as marks along the slider, from 0 (start) to 1 (end). */
  readonly marks = computed(() => {
    const replay = this.replay();
    if (!replay) return [];
    const length = Math.max(1, replay.end - replay.start);
    return replay.events.map(({ at, event }, index) => ({
      index,
      fraction: (at - replay.start) / length,
      category: timelineEventKind(event.type).category
    }));
  });

  constructor() {
    // Stopped when paused, and when the page closes (the effect is destroyed with it)
    effect(onCleanup => {
      if (!this.playing()) return;
      const ticker = setInterval(() => this.advance(PLAY_TICK_MS * untracked(this.speed)), PLAY_TICK_MS);
      onCleanup(() => clearInterval(ticker));
    });
  }

  seek(at: number): void {
    const replay = this.replay();
    if (!replay) return;
    this.cursor.set(Math.min(replay.end, Math.max(replay.start, at)));
  }

  /** Plays from where it is, or from the start once at the end. */
  togglePlaying(): void {
    const replay = this.replay();
    if (!replay) return;
    if (!this.playing() && this.cursor() >= replay.end) this.cursor.set(replay.start);
    this.playing.update(playing => !playing);
  }

  /** Moves to the next event after the moment shown, or the one before it. */
  step(direction: 1 | -1): void {
    const replay = this.replay();
    if (!replay) return;
    this.playing.set(false);
    const cursor = this.cursor();
    if (direction > 0) {
      this.seek(replay.eventTimes.find(at => at > cursor) ?? replay.end);
    } else {
      // The event before the one being shown, unless it is exactly at an event already
      const index = lastAtOrBefore(replay.eventTimes, cursor - 1);
      this.seek(index >= 0 ? replay.eventTimes[index] : replay.start);
    }
  }

  readonly playerName = (playerId: string | undefined): string =>
    this.session.game()?.players.find(player => player.id === playerId)?.displayName ?? 'Someone';

  private advance(by: number): void {
    const replay = this.replay();
    if (!replay) return;
    const next = Math.min(replay.end, this.cursor() + by);
    this.cursor.set(next);
    if (next >= replay.end) this.playing.set(false);
  }
}
