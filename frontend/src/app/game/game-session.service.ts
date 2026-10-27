import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription } from 'rxjs';

import { GameControllerService, GamePlayControllerService, QuestionControllerService } from '../api/generated';
import type {
  AnswerRequest, AskRequest, GameDTO, HidingStationDTO, PlayerDTO, PlayerGameDTO, QuestionDTO, SeekerLocationDTO, StationDTO
} from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { problemDetail } from '../shared/problem-detail';
import type { SseMessage } from '../shared/sse-parser';
import { GameEventStream, GameStreamError } from './game-event-stream.service';

export type GameRole = PlayerDTO.RoleEnum;

/** Why the game is not shown. */
export type GameAccess = 'ok' | 'no-token' | 'refused' | 'not-found' | 'failed';

/** The event stream: opening for the first time, open, or lost and being opened again. */
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'closed';

/** Waits before each new attempt after the stream is lost, in milliseconds; the last repeats. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];

/**
 * The server sends a heartbeat every 20 seconds. A stream silent for longer than this is taken as dead, as a
 * connection can die without either end hearing of it (a phone changing networks, a proxy that keeps its side open).
 */
export const STREAM_SILENCE_MS = 45_000;

/**
 * One game, as the player on this page sees it, kept up to date by the game's event stream, with the host's
 * actions. One per game page (provided by the page). A lost stream is opened again with the ID of the last event
 * received, so the server sends what was missed.
 */
@Injectable()
export class GameSessionService {
  private readonly gameApi = inject(GameControllerService);
  private readonly playApi = inject(GamePlayControllerService);
  private readonly questionApi = inject(QuestionControllerService);
  private readonly tokens = inject(AccessTokenStore);
  private readonly events = inject(GameEventStream);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = inject(DOCUMENT).defaultView;

  private gameId: string | null = null;
  private stream: Subscription | null = null;
  private lastEventId: string | null = null;
  private failedAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Server time minus device time; added to the device's clock to count down. */
  private clockOffsetMs = 0;

  readonly game = signal<GameDTO | null>(null);
  readonly myPlayerId = signal<string | null>(null);
  readonly access = signal<GameAccess>('ok');
  readonly connection = signal<StreamState>('connecting');
  /** True until the first state arrives. */
  readonly loading = signal(true);
  /** A host action in progress. */
  readonly busy = signal(false);
  readonly error = signal('');

  /** Hiders only: where they hide, once chosen. */
  readonly hidingStation = signal<HidingStationDTO | null>(null);
  /** Hiders only: where each seeker was last seen, by player ID. */
  readonly seekerLocations = signal<ReadonlyMap<string, SeekerLocationDTO>>(new Map());

  /** The seekers' questions and the hiders' answers, by ID. */
  private readonly questionsById = signal<ReadonlyMap<string, QuestionDTO>>(new Map());
  /** Oldest first. */
  readonly questions = computed(() => [...this.questionsById().values()]
    .sort((first, second) => Date.parse(first.askedAt) - Date.parse(second.askedAt)));
  /** The question waiting for the hiders' answer, if any. */
  readonly pendingQuestion = computed(() => this.questions().find(question => question.status === 'PENDING') ?? null);

  /** The stations the hiders may choose from; the same for every player, loaded once. */
  private readonly stationList = rxResource({
    params: () => this.access() === 'ok' && this.game() ? this.game()!.id : undefined,
    stream: ({ params: gameId }) => this.playApi.getGameStations(gameId)
  });
  readonly stations = computed<readonly StationDTO[]>(() => this.stationList.hasValue() ? this.stationList.value() : []);

  /** The hiders may choose or change their station: during the hiding time, by the clock. */
  readonly canChooseStation = computed(() => this.me()?.role === 'HIDER' && this.game()?.status === 'HIDING');

  readonly me = computed(() => {
    const myPlayerId = this.myPlayerId();
    return this.game()?.players.find(player => player.id === myPlayerId) ?? null;
  });
  readonly isHost = computed(() => this.me()?.host ?? false);

  /** What still stops the host from starting, or empty when the game can start. */
  readonly startBlockers = computed(() => {
    const players = this.game()?.players ?? [];
    const blockers: string[] = [];
    if (players.some(player => !player.role)) blockers.push('Every player needs a role.');
    if (!players.some(player => player.role === 'HIDER')) blockers.push('The game needs at least one hider.');
    if (!players.some(player => player.role === 'SEEKER')) blockers.push('The game needs at least one seeker.');
    return blockers;
  });

  constructor() {
    // A phone that wakes up or gets its connection back reconnects at once, rather than after the back-off
    const reconnectNow = () => {
      if (this.window?.document.visibilityState !== 'hidden' && this.connection() === 'reconnecting') this.connect();
    };
    this.window?.document.addEventListener('visibilitychange', reconnectNow);
    this.window?.addEventListener('online', reconnectNow);
    this.destroyRef.onDestroy(() => {
      this.window?.document.removeEventListener('visibilitychange', reconnectNow);
      this.window?.removeEventListener('online', reconnectNow);
      this.close();
    });
  }

  /** Starts following the game; stops once it is finished. */
  follow(gameId: string): void {
    this.close();
    this.gameId = gameId;
    this.lastEventId = null;
    this.failedAttempts = 0;
    if (!this.tokens.get('games', gameId)) {
      this.access.set('no-token');
      this.loading.set(false);
      return;
    }
    this.connect();
  }

  /** The server's idea of now, in milliseconds since the epoch. */
  serverNow(deviceNow: number): number {
    return deviceNow + this.clockOffsetMs;
  }

  setRole(playerId: string, role: GameRole | null): void {
    const game = this.game();
    if (game) this.act(this.gameApi.setPlayerRole(game.id, playerId, role ? { role } : {}));
  }

  start(): void {
    const game = this.game();
    if (game) this.act(this.gameApi.startGame(game.id));
  }

  end(): void {
    const game = this.game();
    if (game) this.act(this.gameApi.endGame(game.id));
  }

  /** The seekers found the hiders: ends the game. */
  found(): void {
    const game = this.game();
    if (game) this.act(this.gameApi.foundHiders(game.id));
  }

  /** Asks the hiders; true once the question is asked, false if refused (the reason is in {@link error}). */
  ask(request: AskRequest): Promise<boolean> {
    const game = this.game();
    if (!game) return Promise.resolve(false);
    return this.send(this.questionApi.askQuestion(game.id, request), 'The question could not be asked.');
  }

  answer(questionId: string, request: AnswerRequest): Promise<boolean> {
    const game = this.game();
    if (!game) return Promise.resolve(false);
    return this.send(this.questionApi.answerQuestion(game.id, questionId, request), 'The answer could not be sent.');
  }

  chooseHidingStation(stationId: string): void {
    const game = this.game();
    if (!game) return;
    this.busy.set(true);
    this.error.set('');
    this.playApi.chooseHidingStation(game.id, { stationId }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: chosen => {
        this.hidingStation.set(chosen);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemDetail(error) ?? 'The station could not be chosen. Check the connection and try again.');
      }
    });
  }

  private connect(): void {
    clearTimeout(this.reconnectTimer);
    this.stream?.unsubscribe();
    const token = this.gameId ? this.tokens.get('games', this.gameId) : undefined;
    if (!this.gameId || !token) return;

    this.connection.set(this.game() ? 'reconnecting' : 'connecting');
    this.expectWithinSilenceLimit();
    this.stream = this.events.connect(this.gameId, token, this.lastEventId).subscribe({
      next: message => this.receive(message),
      error: (error: unknown) => this.lost(error),
      complete: () => this.lost(null)
    });
  }

  private receive(message: SseMessage): void {
    this.expectWithinSilenceLimit();
    if (message.id !== undefined) this.lastEventId = message.id;
    switch (message.type) {
      case 'open':
        this.failedAttempts = 0;
        this.connection.set('live');
        return;
      case 'snapshot':
        this.applyView(JSON.parse(message.data) as PlayerGameDTO);
        break;
      case 'game':
        this.game.set(JSON.parse(message.data) as GameDTO);
        // A player who stops being a hider (in the lobby) has no business keeping what only hiders see; once the
        // game is over, the hiding station is everyone's to see
        if (this.me()?.role !== 'HIDER' && this.game()?.status !== 'FINISHED') this.clearHiderView();
        break;
      case 'hiding-station':
        this.hidingStation.set(JSON.parse(message.data) as HidingStationDTO);
        return;
      case 'question':
        this.storeQuestion(JSON.parse(message.data) as QuestionDTO);
        return;
      case 'seeker-location': {
        const location = JSON.parse(message.data) as SeekerLocationDTO;
        this.seekerLocations.update(locations => new Map(locations).set(location.playerId, location));
        return;
      }
      case 'heartbeat':
        this.setServerTime((JSON.parse(message.data) as { serverTime: string }).serverTime);
        return;
      default:
        // 'caught-up', and event types this version does not know yet
        return;
    }
    if (this.game()?.status === 'FINISHED') this.close();
  }

  /** Restarts the wait for the next message; when it runs out, the stream is given up and opened again. */
  private expectWithinSilenceLimit(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.stream?.unsubscribe();
      this.lost(null);
    }, STREAM_SILENCE_MS);
  }

  /** The stream ended or failed: stop if this player may not follow the game, else try again after a while. */
  private lost(error: unknown): void {
    clearTimeout(this.silenceTimer);
    const status = error instanceof GameStreamError ? error.status : undefined;
    if (status === 401 || status === 403 || status === 404) {
      this.access.set(status === 404 ? 'not-found' : 'refused');
      this.loading.set(false);
      this.close();
      return;
    }
    if (!this.game()) {
      this.access.set('failed');
      this.loading.set(false);
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(this.failedAttempts, RECONNECT_DELAYS_MS.length - 1)];
    this.failedAttempts++;
    this.connection.set('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private close(): void {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.silenceTimer);
    this.stream?.unsubscribe();
    this.stream = null;
    this.connection.set('closed');
  }

  private act(request: Observable<PlayerGameDTO>): void {
    this.busy.set(true);
    this.error.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: view => {
        this.applyView(view);
        this.busy.set(false);
        if (view.game.status === 'FINISHED') this.close();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemDetail(error) ?? 'That did not work. Check the connection and try again.');
      }
    });
  }

  private applyView(view: PlayerGameDTO): void {
    this.setServerTime(view.serverTime);
    this.game.set(view.game);
    this.myPlayerId.set(view.myPlayerId);
    this.hidingStation.set(view.hidingStation ?? null);
    this.seekerLocations.set(new Map(view.seekerLocations.map(location => [location.playerId, location] as const)));
    this.questionsById.set(new Map(view.questions.map(question => [question.id, question] as const)));
    this.access.set('ok');
    this.loading.set(false);
  }

  private send(request: Observable<QuestionDTO>, fallback: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    return new Promise(resolve => request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: question => {
        this.storeQuestion(question);
        this.busy.set(false);
        resolve(true);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemDetail(error) ?? fallback);
        resolve(false);
      }
    }));
  }

  private storeQuestion(question: QuestionDTO): void {
    this.questionsById.update(questions => new Map(questions).set(question.id, question));
  }

  private clearHiderView(): void {
    this.hidingStation.set(null);
    this.seekerLocations.set(new Map());
  }

  private setServerTime(serverTime: string): void {
    const parsed = Date.parse(serverTime);
    if (Number.isFinite(parsed)) this.clockOffsetMs = parsed - Date.now();
  }
}
