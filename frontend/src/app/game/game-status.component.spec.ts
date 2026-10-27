import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { GameDTO } from '../api/generated';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { GameClock } from './game-clock.service';
import { GameSessionService } from './game-session.service';
import { GameStatusComponent } from './game-status.component';
import { expectNoAxeViolations } from '../../testing/axe';

describe('GameStatusComponent', () => {
  let status: ReturnType<typeof signal<GameDTO['status']>>;
  let fixture: ComponentFixture<GameStatusComponent>;
  let element: HTMLElement;
  const attention = signal<ReadonlySet<string>>(new Set());

  beforeEach(() => {
    status = signal('HIDING');
    attention.set(new Set());
    TestBed.configureTestingModule({
      imports: [GameStatusComponent],
      providers: [
        { provide: GameSessionService, useValue: { game: computed(() => ({ status: status() })) } },
        { provide: GameClock, useValue: { phaseTime: signal('12:05') } },
        {
          provide: ControlsPanelService,
          useValue: { needsAttention: (menu: string) => attention().has(menu), show: vi.fn() }
        }
      ]
    });
    fixture = TestBed.createComponent(GameStatusComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the phase and its clock, and opens the game tab', async () => {
    const button = element.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Hiding');
    expect(button.textContent).toContain('12:05');
    expect(button.getAttribute('aria-label')).toBe('Hiding, 12:05 left. Open the game');
    await expectNoAxeViolations(element);

    button.click();
    expect(TestBed.inject(ControlsPanelService).show).toHaveBeenCalledWith('game');
  });

  it('says what waits for the player and opens the tab for it', () => {
    status.set('SEEKING');
    attention.set(new Set(['questions']));
    fixture.detectChanges();
    const button = element.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Question waiting');

    button.click();
    expect(TestBed.inject(ControlsPanelService).show).toHaveBeenCalledWith('questions');
  });

  it('is not shown outside hiding and seeking', () => {
    status.set('LOBBY');
    fixture.detectChanges();
    expect(element.querySelector('button')).toBeNull();
  });
});
