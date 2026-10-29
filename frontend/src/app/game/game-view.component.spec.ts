import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';

import {
  GameControllerService, GamePlayControllerService, GameTimelineControllerService, QuestionControllerService
} from '../api/generated';
import type { GameDTO, GameTimelineDTO, PlayerGameDTO } from '../api/generated';
import { TOKEN_STORAGE } from '../auth/access-token.store';
import { MapService } from '../map/map.service';
import { GeolocationService } from '../position/geolocation.service';
import { RouteSelectionService } from '../transit/route-selection.service';
import type { SseMessage } from '../shared/sse-parser';
import { GameEventStream, GameStreamError, STREAM_OPEN } from './game-event-stream.service';
import { GameMapService } from './game-map.service';
import { GameSessionService, RECONNECT_DELAYS_MS, STREAM_SILENCE_MS } from './game-session.service';
import { LocationReporter } from './location-reporter.service';
import { GameReplayService } from './replay/game-replay.service';
import { GameClock } from './game-clock.service';
import { GameViewComponent } from './game-view.component';
import { PushNotificationsService } from './push-notifications.service';
import { expectNoAxeViolations } from '../../testing/axe';

const NOW = Date.parse('2026-10-25T12:00:00Z');

function game(overrides: Partial<GameDTO> = {}): GameDTO {
  return {
    id: 'g1',
    name: 'Göteborg',
    inviteCode: 'ABC234',
    status: 'LOBBY',
    hidingMinutes: 30,
    boundary: [],
    routes: [],
    stationCount: 61,
    players: [
      { id: 'p1', displayName: 'Ada', host: true },
      { id: 'p2', displayName: 'Grace', host: false }
    ],
    ...overrides
  };
}

/** Seeking for ten minutes, with Ada (the host) hiding and Grace seeking. */
function seeking(overrides: Partial<GameDTO> = {}): GameDTO {
  return game({
    status: 'SEEKING',
    hidingStartedAt: new Date(NOW - 40 * 60_000).toISOString(),
    hidingEndsAt: new Date(NOW - 10 * 60_000).toISOString(),
    seekingStartedAt: new Date(NOW - 10 * 60_000).toISOString(),
    players: [
      { id: 'p1', displayName: 'Ada', host: true, role: 'HIDER' },
      { id: 'p2', displayName: 'Grace', host: false, role: 'SEEKER' }
    ],
    ...overrides
  });
}

/** An empty timeline; the replay itself has its own tests. */
function timelineFor(gameId: string): Observable<GameTimelineDTO> {
  return of({ game: game({ id: gameId, status: 'FINISHED', outcome: 'ENDED' }), tracks: [], events: [] });
}

function view(state: GameDTO, myPlayerId = 'p1', extra: Partial<PlayerGameDTO> = {}): PlayerGameDTO {
  return { game: state, myPlayerId, serverTime: new Date(Date.now()).toISOString(), seekerLocations: [], questions: [], ...extra };
}

describe('GameViewComponent', () => {
  let gameApi: Record<'setPlayerRole' | 'startGame' | 'endGame' | 'foundHiders', ReturnType<typeof vi.fn>>;
  /** One per stream opened, in order; with the Last-Event-ID it was opened with. */
  let streams: { subject: Subject<SseMessage>; lastEventId: string | null; closed: boolean }[];
  let playApi: Record<'getGameStations' | 'reportLocation' | 'chooseHidingStation', ReturnType<typeof vi.fn>>;
  let gpsPosition: ReturnType<typeof signal<{ longitude: number; latitude: number; accuracyMeters: number; timestamp: number } | null>>;
  let fixture: ComponentFixture<GameViewComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    streams = [];
    gameApi = {
      setPlayerRole: vi.fn((_game: string, playerId: string, { role }: { role?: 'SEEKER' | 'HIDER' }) =>
        of(view(game({ players: game().players.map(player => player.id === playerId ? { ...player, role } : player) })))),
      startGame: vi.fn(() => of(view(game()))),
      endGame: vi.fn(() => of(view(game({ status: 'FINISHED', outcome: 'ENDED' })))),
      foundHiders: vi.fn(() => of(view(game({ status: 'FINISHED', outcome: 'FOUND' }))))
    };
    playApi = {
      getGameStations: vi.fn(() => of([])),
      reportLocation: vi.fn(() => of(undefined)),
      chooseHidingStation: vi.fn()
    };
    gpsPosition = signal(null);
    const storage = new Map([['jetlag.accessTokens', JSON.stringify({ games: { g1: 'token' }, templates: {} })]]);

    TestBed.configureTestingModule({
      imports: [GameViewComponent],
      providers: [
        provideRouter([]),
        // Notifications have their own spec; no service worker here
        { provide: PushNotificationsService, useValue: { state: () => Promise.resolve('unsupported') } },
        // Provided by the game page in the app
        GameSessionService,
        GameClock,
        GameReplayService,
        GameMapService,
        LocationReporter,
        { provide: GameTimelineControllerService, useValue: { getGameTimeline: (gameId: string) => timelineFor(gameId) } },
        { provide: GameControllerService, useValue: gameApi },
        { provide: GamePlayControllerService, useValue: playApi },
        { provide: QuestionControllerService, useValue: {} },
        { provide: MapService, useValue: { getMap: () => null } },
        {
          provide: RouteSelectionService,
          useValue: { selectedRouteIds: signal([]), fitView: signal(true), showStops: signal(true), select: vi.fn() }
        },
        {
          provide: GeolocationService,
          useValue: { position: gpsPosition, error: signal(null), track: vi.fn(() => () => undefined) }
        },
        {
          provide: GameEventStream,
          useValue: {
            connect: (_gameId: string, _token: string, lastEventId: string | null) => {
              const stream = { subject: new Subject<SseMessage>(), lastEventId, closed: false };
              streams.push(stream);
              return new Observable<SseMessage>(subscriber => {
                const subscription = stream.subject.subscribe(subscriber);
                return () => {
                  stream.closed = true;
                  subscription.unsubscribe();
                };
              });
            }
          }
        },
        { provide: TOKEN_STORAGE, useValue: { getItem: (key: string) => storage.get(key) ?? null, setItem: () => undefined } }
      ]
    });
  });

  afterEach(() => vi.useRealTimers());

  function render(gameId = 'g1'): void {
    fixture = TestBed.createComponent(GameViewComponent);
    TestBed.inject(GameSessionService).follow(gameId);
    TestBed.inject(LocationReporter);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  /** Sends events on the latest stream. */
  function send(...messages: SseMessage[]): void {
    messages.forEach(message => streams.at(-1)!.subject.next(message));
    fixture.detectChanges();
  }

  function snapshot(id: string, state: GameDTO, myPlayerId = 'p1'): SseMessage {
    return { id, type: 'snapshot', data: JSON.stringify(view(state, myPlayerId)) };
  }

  function text(selector: string): string {
    return element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** The recap's facts, as "term: value". */
  function facts(): string[] {
    return [...element.querySelectorAll('.recap-facts div')]
      .map(row => `${row.querySelector('dt')?.textContent?.trim()}: ${row.querySelector('dd')?.textContent?.trim()}`);
  }

  function button(label: string): HTMLButtonElement {
    return [...element.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!;
  }

  it('shows the lobby from the snapshot, and lets the host hand out roles', async () => {
    render();
    send(STREAM_OPEN, snapshot('5', game()));
    vi.useRealTimers();
    await expectNoAxeViolations(element);

    expect(streams).toHaveLength(1);
    expect(streams[0].lastEventId).toBeNull();
    expect(text('#game-heading')).toBe('Göteborg');
    expect(text('.invite-code')).toBe('ABC234');
    expect(element.querySelector('.invite-code')?.getAttribute('aria-label')).toBe('Invite code A B C 2 3 4');
    expect(text('.player-list')).toContain('Ada you host');
    expect(button('Start the game').disabled).toBe(true);
    expect(text('#start-blockers')).toContain('Every player needs a role.');

    const graceRole = element.querySelector('select[aria-label="Role of Grace"]') as HTMLSelectElement;
    graceRole.value = 'HIDER';
    graceRole.dispatchEvent(new Event('change'));
    expect(gameApi.setPlayerRole).toHaveBeenCalledWith('g1', 'p2', { role: 'HIDER' });

    const adaRole = element.querySelector('select[aria-label="Role of Ada"]') as HTMLSelectElement;
    adaRole.value = '';
    adaRole.dispatchEvent(new Event('change'));
    expect(gameApi.setPlayerRole).toHaveBeenLastCalledWith('g1', 'p1', {});
  });

  it('shows changes as their events arrive', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game()));
    send({ id: '6', type: 'game', data: JSON.stringify(game({
      players: [...game().players, { id: 'p3', displayName: 'Linus', host: false }]
    })) });

    expect(text('.player-list')).toContain('Linus');
    expect(text('.player-list')).toContain('Ada you host');
  });

  it('lets the host start once everyone has a role', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game({
      players: [
        { id: 'p1', displayName: 'Ada', host: true, role: 'SEEKER' },
        { id: 'p2', displayName: 'Grace', host: false, role: 'HIDER' }
      ]
    })));

    expect(button('Start the game').disabled).toBe(false);
    expect(text('#start-blockers')).toContain('The hiders get 30 minutes');
    button('Start the game').click();
    expect(gameApi.startGame).toHaveBeenCalledWith('g1');
  });

  it('counts the hiding time down by the server clock, which heartbeats keep correcting', () => {
    render();
    const hiding = game({
      status: 'HIDING',
      hidingStartedAt: new Date(NOW).toISOString(),
      hidingEndsAt: new Date(NOW + 30 * 60_000).toISOString(),
      players: [
        { id: 'p1', displayName: 'Ada', host: true, role: 'SEEKER' },
        { id: 'p2', displayName: 'Grace', host: false, role: 'HIDER' }
      ]
    });
    send(STREAM_OPEN, snapshot('5', hiding, 'p2'));

    expect(text('.phase-title')).toBe('The hiders are hiding');
    expect(text('.countdown')).toBe('30:00');
    expect(text('.phase-hint')).toContain('Choose your hiding station');
    expect(element.querySelector('.invite-code')).toBeNull();
    expect(element.querySelector('select')).toBeNull();

    vi.advanceTimersByTime(61_000);
    fixture.detectChanges();
    expect(text('.countdown')).toBe('28:59');

    // The server says it is two minutes later than the device thinks
    send({ type: 'heartbeat', data: JSON.stringify({ serverTime: new Date(Date.now() + 120_000).toISOString() }) });
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(text('.countdown')).toBe('26:58');
  });

  it('reconnects after losing the stream, asking for what it missed', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game()), { id: '6', type: 'game', data: JSON.stringify(game()) });

    streams[0].subject.error(new GameStreamError(undefined));
    fixture.detectChanges();
    expect(text('.connection-status')).toContain('Reconnecting');
    expect(streams).toHaveLength(1);

    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(2);
    expect(streams[1].lastEventId).toBe('6');

    // The server ending the stream (after its timeout) also leads to a new one, once it has opened again
    send(STREAM_OPEN);
    expect(text('.connection-status')).toBe('');
    streams[1].subject.complete();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(3);
  });

  it('counts the seeking time up from when the seekers set off', () => {
    // The device is a minute behind the server; the seekers set off ten minutes ago, by the server's clock
    vi.setSystemTime(NOW - 60_000);
    render();
    send(STREAM_OPEN, { id: '5', type: 'snapshot', data: JSON.stringify({
      ...view(seeking(), 'p1'), serverTime: new Date(NOW).toISOString()
    }) });

    expect(text('.phase-title')).toBe('The seekers are on their way');
    expect(text('.countdown')).toBe('10:00');
    vi.advanceTimersByTime(65_000);
    fixture.detectChanges();
    expect(text('.countdown')).toBe('11:05');
  });

  it('lets a seeker say the hiders were found, after asking, and then shows the recap', async () => {
    render();
    send(STREAM_OPEN, snapshot('5', seeking(), 'p2'));
    expect(button('End game…')).toBeUndefined();

    button('We found them…').click();
    fixture.detectChanges();
    expect(text('#found-question')).toContain('ends the game for everyone');
    expect(document.activeElement?.id).toBe('found-keep');
    button('Not yet').click();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('found-ask');

    button('We found them…').click();
    fixture.detectChanges();
    button('We found them').click();
    fixture.detectChanges();
    expect(gameApi.foundHiders).toHaveBeenCalledWith('g1');
    expect(text('#recap-heading')).toBe('Game recap');
    expect(streams[0].closed).toBe(true);
  });

  it('recaps a found game: the time, where the hiders were, who played and what was asked', async () => {
    render();
    const finished = seeking({
      status: 'FINISHED',
      outcome: 'FOUND',
      finishedAt: new Date(NOW + 72 * 60_000 + 5_000).toISOString()
    });
    send(STREAM_OPEN, { id: '9', type: 'snapshot', data: JSON.stringify(view(finished, 'p2', {
      hidingStation: {
        station: { stationId: 'k', name: 'Korsvägen', longitude: 11.99, latitude: 57.69 },
        chosenBy: 'p1', chosenAt: new Date(NOW - 50 * 60_000).toISOString()
      },
      questions: [
        {
          id: 'q1', type: 'RADAR', params: { distanceMeters: 2000 }, status: 'ANSWERED', askedBy: 'p2',
          askedAt: new Date(NOW + 5 * 60_000).toISOString(), deadlineAt: new Date(NOW + 10 * 60_000).toISOString(),
          answer: { choice: 'YES' }
        },
        {
          id: 'q2', type: 'MATCHING', params: { category: 'parks' }, status: 'PENDING', askedBy: 'p2',
          askedAt: new Date(NOW + 70 * 60_000).toISOString(), deadlineAt: new Date(NOW + 75 * 60_000).toISOString()
        }
      ]
    })) });

    expect(text('.phase-title')).toBe('The seekers found the hiders');
    expect(text('.recap-time-label')).toBe('Found after');
    // Ten minutes of seeking before the snapshot's time, and 72 min 5 s after it
    expect(text('.countdown')).toBe('1:22:05');
    expect(facts()).toContain('Hiding station: Korsvägen');
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(button('Watch on the map')).toBeDefined();
    expect(facts()).toContain('Hiders: Ada');
    expect(facts()).toContain('Seekers: Grace');
    expect(text('[aria-labelledby=recap-questions-heading] .panel-heading')).toContain('1 answered · 1 not');
    expect([...element.querySelectorAll('.question-history li')].map(item =>
      [...item.querySelectorAll('p')].slice(0, 2).map(line => line.textContent?.trim()))).toEqual([
      ['Are you within 2.0 km of us?', 'Yes'],
      ['Is your nearest park the same as ours?', 'Not answered before the end']
    ]);
    // A finished game no longer changes: the time stays as it ended
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(text('.countdown')).toBe('1:22:05');

    vi.useRealTimers();
    await expectNoAxeViolations(element);
  });

  it('recaps a game ended before the seekers set off', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game({ status: 'FINISHED', outcome: 'ENDED', finishedAt: new Date(NOW).toISOString() })));
    expect(text('.phase-title')).toBe('The host ended the game');
    expect(text('.recap-result')).toContain('The game ended before the seekers set off.');
    expect(facts()).toContain('Hiding station: None was chosen');
  });

  it('gives up a stream that has gone silent and opens a new one', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game()));

    // Heartbeats keep it open
    vi.advanceTimersByTime(STREAM_SILENCE_MS - 1000);
    send({ type: 'heartbeat', data: JSON.stringify({ serverTime: new Date(Date.now()).toISOString() }) });
    vi.advanceTimersByTime(STREAM_SILENCE_MS - 1000);
    expect(streams[0].closed).toBe(false);

    // Silence beyond the limit: closed, and opened again after the first back-off
    vi.advanceTimersByTime(1000);
    expect(streams[0].closed).toBe(true);
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(2);
    expect(streams[1].lastEventId).toBe('5');
  });

  it('shows a hider where the seekers were last seen, as their positions arrive', async () => {
    const hiding = game({
      status: 'HIDING',
      hidingEndsAt: new Date(NOW + 30 * 60_000).toISOString(),
      players: [
        { id: 'p1', displayName: 'Ada', host: true, role: 'SEEKER' },
        { id: 'p2', displayName: 'Grace', host: false, role: 'HIDER' }
      ]
    });
    render();
    send(STREAM_OPEN, { id: '5', type: 'snapshot', data: JSON.stringify(view(hiding, 'p2')) });
    expect(text('.phase-hint')).toBe('Choose your hiding station in the Hiding station tab.');
    expect(text('[aria-labelledby=seekers-heading]')).toContain('No seeker has shared a position yet.');

    vi.advanceTimersByTime(3 * 60_000);
    send({ id: '6', type: 'seeker-location', data: JSON.stringify({
      playerId: 'p1', longitude: 11.97, latitude: 57.7, accuracyMeters: 10, recordedAt: new Date(NOW).toISOString()
    }) });
    expect(text('.seeker-line')).toBe('Ada 3 min ago');
    // A hider's position is kept for the replay only
    gpsPosition.set({ longitude: 11.99, latitude: 57.69, accuracyMeters: 5, timestamp: NOW });
    fixture.detectChanges();
    expect(text('[aria-labelledby=sharing-heading]')).toContain('Nobody sees it while the game runs');
    vi.useRealTimers();
    await expectNoAxeViolations(element);
  });

  it('tells a seeker their position is shared, and shares it', () => {
    const hiding = game({
      status: 'HIDING',
      hidingEndsAt: new Date(NOW + 30 * 60_000).toISOString(),
      players: [
        { id: 'p1', displayName: 'Ada', host: true, role: 'SEEKER' },
        { id: 'p2', displayName: 'Grace', host: false, role: 'HIDER' }
      ]
    });
    render();
    send(STREAM_OPEN, snapshot('5', hiding));
    expect(text('[aria-labelledby=sharing-heading]')).toContain('Finding your position');

    gpsPosition.set({ longitude: 11.98, latitude: 57.71, accuracyMeters: 8, timestamp: NOW });
    fixture.detectChanges();
    expect(text('[aria-labelledby=sharing-heading]')).toContain('Shared with the hiders');
    expect(playApi.reportLocation).toHaveBeenCalledWith('g1', { longitude: 11.98, latitude: 57.71, accuracyMeters: 8 });
    expect(element.querySelector('[aria-labelledby=seekers-heading]')).toBeNull();
  });

  it('stops following a finished game', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game({ status: 'FINISHED', outcome: 'ENDED' })));

    expect(text('.phase-title')).toBe('The host ended the game');
    expect(streams[0].closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(streams).toHaveLength(1);
  });

  it('asks before ending the game, and stops following it once ended', () => {
    render();
    send(STREAM_OPEN, snapshot('5', game()));
    button('End game…').click();
    fixture.detectChanges();
    expect(text('#end-question')).toBe('End the game for everyone?');
    // The button that opened the question is gone: focus goes to the safe choice, and back again
    expect(document.activeElement?.id).toBe('end-keep');
    button('Keep playing').click();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('end-ask');
    button('End game…').click();
    fixture.detectChanges();

    button('End game').click();
    fixture.detectChanges();
    expect(gameApi.endGame).toHaveBeenCalledWith('g1');
    expect(streams[0].closed).toBe(true);
  });

  it('explains a game this browser has not joined, or no longer may see', () => {
    render('other');
    expect(text('.load-error')).toBe('This browser has not joined this game.');
    expect(streams).toHaveLength(0);

    render();
    streams[0].subject.error(new GameStreamError(403));
    fixture.detectChanges();
    expect(text('.load-error')).toBe('This browser\'s place in the game is no longer valid.');
    vi.advanceTimersByTime(60_000);
    expect(streams).toHaveLength(1);
  });
});
