import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { GameTimelineControllerService } from '../../api/generated';
import type { GameDTO } from '../../api/generated';
import { GameSessionService } from '../game-session.service';
import { expectNoAxeViolations } from '../../../testing/axe';
import { GameReplayService, PLAY_TICK_MS } from './game-replay.service';
import { GameTimelineComponent } from './game-timeline.component';
import { TIMELINE } from '../../../testing/game-timeline';

describe('GameTimelineComponent', () => {
  let fixture: ComponentFixture<GameTimelineComponent>;
  let element: HTMLElement;
  let replay: GameReplayService;

  beforeEach(async () => {
    vi.useFakeTimers();
    const game = signal<GameDTO | null>(TIMELINE.game);
    TestBed.configureTestingModule({
      imports: [GameTimelineComponent],
      providers: [
        GameReplayService,
        { provide: GameSessionService, useValue: { game, access: signal('ok') } },
        { provide: GameTimelineControllerService, useValue: { getGameTimeline: vi.fn(() => of(TIMELINE)) } }
      ]
    });
    fixture = TestBed.createComponent(GameTimelineComponent);
    replay = TestBed.inject(GameReplayService);
    fixture.detectChanges();
    // The timeline arrives a moment later
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  const slider = () => element.querySelector<HTMLInputElement>('input[type=range]')!;
  const text = (selector: string) => element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (label: string) => element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it('starts at the end of the game, with a mark for each event', () => {
    expect(slider().value).toBe(String(60 * 60_000));
    expect(text('.timeline-elapsed')).toBe('1:00:00');
    expect(text('.timeline-event')).toBe('The seekers found the hiders.');
    expect(element.querySelectorAll('.mark')).toHaveLength(TIMELINE.events.length);
    expect(element.querySelectorAll('.mark-question')).toHaveLength(1);
  });

  it('moves to the moment chosen on the slider', () => {
    slider().value = String(41 * 60_000);
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(text('.timeline-elapsed')).toBe('41:00');
    expect(text('.timeline-event')).toBe('Grace asked: Are you within 2.0 km of us?');
    expect(slider().getAttribute('aria-valuetext')).toContain('41:00 into the game');
    expect(replay.frame()?.questions[0].status).toBe('PENDING');
  });

  it('steps from one event to the next and back', () => {
    // The start is the first event: the game starting
    replay.seek(replay.replay()!.start);
    button('Next event').click();
    fixture.detectChanges();
    expect(text('.timeline-event')).toBe('Ada chose Centralstationen to hide at.');

    button('Previous event').click();
    fixture.detectChanges();
    expect(text('.timeline-event')).toBe('The game started and the hiders set off.');
  });

  it('plays from the start at the chosen speed, and stops at the end', () => {
    button('Play').click();
    fixture.detectChanges();
    expect(text('.timeline-elapsed')).toBe('0:00');
    expect(button('Pause')).toBeDefined();

    // A minute of the game per second
    vi.advanceTimersByTime(30 * 1000);
    fixture.detectChanges();
    expect(text('.timeline-elapsed')).toBe('30:00');

    vi.advanceTimersByTime(60 * 1000 + PLAY_TICK_MS);
    fixture.detectChanges();
    expect(text('.timeline-elapsed')).toBe('1:00:00');
    expect(replay.playing()).toBe(false);
  });

  it('passes the accessibility checks', async () => {
    vi.useRealTimers();
    await expectNoAxeViolations(element);
  });
});
