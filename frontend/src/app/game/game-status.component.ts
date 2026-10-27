import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import type { ControlsMenu } from '../controls/controls-panel.service';
import { GameClock } from './game-clock.service';
import { GameSessionService } from './game-session.service';

/**
 * The running game at a glance, over the map: its phase and clock, and what waits for the player. Seen with
 * the controls panel closed; a click opens the panel where that is dealt with.
 */
@Component({
  selector: 'app-game-status',
  template: `
    @if (phase(); as phase) {
      <button type="button" [class]="'game-status phase-' + phase.status" [attr.aria-label]="label()" (click)="open()">
        <span class="status-phase">{{ phase.label }}</span>
        <span class="status-time">{{ clock.phaseTime() }}</span>
        @if (waiting(); as waiting) {
          <span class="status-waiting">{{ waiting.text }}</span>
        }
      </button>
    }
  `,
  styles: `
    .game-status {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      max-width: 100%;
      padding: 4px 12px 4px 10px;
      border: 1px solid var(--control-field-border);
      border-left: 4px solid var(--control-accent);
      border-radius: 18px;
      background: #ffffff;
      color: var(--control-ink);
      box-shadow: 0 2px 8px rgb(23 43 50 / 18%);
      font: 600 14px/1.2 system-ui, sans-serif;
      cursor: pointer;

      &:hover {
        background: var(--control-hover);
      }

      &:focus-visible {
        outline: 3px solid var(--control-accent);
        outline-offset: 2px;
      }

      &.phase-hiding {
        border-left-color: var(--control-warning);
      }

      &.phase-seeking {
        border-left-color: var(--control-info);
      }
    }

    .status-time {
      font-variant-numeric: tabular-nums;
    }

    .status-waiting {
      overflow: hidden;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--control-danger);
      color: #ffffff;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameStatusComponent {
  private readonly session = inject(GameSessionService);
  private readonly controls = inject(ControlsPanelService);
  protected readonly clock = inject(GameClock);

  protected readonly phase = computed(() => {
    switch (this.session.game()?.status) {
      case 'HIDING': return { status: 'hiding', label: 'Hiding', clockLabel: 'left' };
      case 'SEEKING': return { status: 'seeking', label: 'Seeking', clockLabel: 'so far' };
      default: return null;
    }
  });

  /** What waits for the player, and the tab where they deal with it. */
  protected readonly waiting = computed<{ text: string; tab: ControlsMenu } | null>(() => {
    if (this.controls.needsAttention('questions')) return { text: 'Question waiting', tab: 'questions' };
    if (this.controls.needsAttention('hiding')) return { text: 'Choose your station', tab: 'hiding' };
    return null;
  });

  protected readonly label = computed(() => {
    const phase = this.phase();
    if (!phase) return '';
    const waiting = this.waiting();
    return `${phase.label}, ${this.clock.phaseTime()} ${phase.clockLabel}.${waiting ? ` ${waiting.text}.` : ''} Open the game`;
  });

  protected open(): void {
    this.controls.show(this.waiting()?.tab ?? 'game');
  }
}
