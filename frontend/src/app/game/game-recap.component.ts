import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { GameDTO, QuestionDTO } from '../api/generated';
import { formatElapsed } from '../shared/format';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { injectFocusAfterRender } from '../shared/focus';
import { GameSessionService } from './game-session.service';
import { QuestionPhotoComponent } from './question-photo.component';
import { GameReplayService } from './replay/game-replay.service';
import { answerText, questionText } from './questions';

/** A time of day, as the device shows times: "14:05". */
export function clockTime(time: string): string {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The seeking time, from setting off to the end; null when the seekers never set off. */
export function seekingDuration(game: Pick<GameDTO, 'seekingStartedAt' | 'finishedAt'>): number | null {
  return game.seekingStartedAt && game.finishedAt
    ? Math.max(0, Date.parse(game.finishedAt) - Date.parse(game.seekingStartedAt))
    : null;
}

/**
 * What happened in a finished game: how it ended and how long the hiders stayed hidden, where they hid, who
 * played which side, and every question with its answer. Shown in place of the game once it is over.
 */
@Component({
  selector: 'app-game-recap',
  imports: [QuestionPhotoComponent, RouterLink],
  template: `
    @if (session.game(); as game) {
      <section class="panel-section" aria-labelledby="recap-heading">
        <div class="panel-heading">
          <h3 id="recap-heading" tabindex="-1">Game recap</h3>
          <span>{{ game.name }}</span>
        </div>

        <div class="phase phase-finished recap-result">
          <p class="phase-title">{{ outcomeTitle() }}</p>
          @if (seekingTime(); as time) {
            <p class="recap-time-label">{{ game.outcome === 'FOUND' ? 'Found after' : 'Seeking time' }}</p>
            <p class="countdown">{{ time }}</p>
          } @else {
            <p class="phase-hint">The game ended before the seekers set off.</p>
          }
        </div>

        <dl class="recap-facts">
          <div>
            <dt>Hiding station</dt>
            <dd>{{ session.hidingStation()?.station?.name ?? 'None was chosen' }}</dd>
          </div>
          @if (game.hidingStartedAt) {
            <div>
              <dt>Hiding started</dt>
              <dd>{{ clock(game.hidingStartedAt) }} ({{ game.hidingMinutes }} min to hide)</dd>
            </div>
          }
          @if (game.seekingStartedAt) {
            <div>
              <dt>Seekers set off</dt>
              <dd>{{ clock(game.seekingStartedAt) }}</dd>
            </div>
          }
          @if (game.finishedAt) {
            <div>
              <dt>Ended</dt>
              <dd>{{ clock(game.finishedAt) }}</dd>
            </div>
          }
        </dl>
      </section>

      <section class="panel-section" aria-labelledby="recap-replay-heading">
        <h3 id="recap-replay-heading" class="panel-heading">Replay</h3>
        @if (replay.active()) {
          <p class="phase-hint">
            Move the slider along the bottom of the map to watch the game again: where everyone went, and each
            question where it was asked.
          </p>
          <div class="panel-actions">
            <button type="button" (click)="watchReplay()">Watch on the map</button>
          </div>
        } @else if (replay.loadFailed()) {
          <p class="load-error" role="alert">The replay could not be loaded.</p>
        } @else {
          <p class="status-text">Loading the replay…</p>
        }
      </section>

      <section class="panel-section" aria-labelledby="recap-players-heading">
        <h3 id="recap-players-heading" class="panel-heading">Players</h3>
        <dl class="recap-facts">
          <div>
            <dt>Hiders</dt>
            <dd>{{ names('HIDER') || 'None' }}</dd>
          </div>
          <div>
            <dt>Seekers</dt>
            <dd>{{ names('SEEKER') || 'None' }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel-section" aria-labelledby="recap-questions-heading">
        <div class="panel-heading">
          <h3 id="recap-questions-heading">Questions</h3>
          <span>{{ questionSummary() }}</span>
        </div>
        <ol class="question-history">
          @for (question of session.questions(); track question.id) {
            <li>
              <p class="question-text">{{ text(question) }}</p>
              <p [class]="question.status === 'ANSWERED' ? 'answer' : 'answer expired'">{{ answerOf(question) }}</p>
              @if (question.answer?.choice === 'PHOTO') {
                <app-question-photo [question]="question" />
              }
              <p class="status-text">{{ askerName(question) }} · {{ clock(question.askedAt) }}</p>
            </li>
          } @empty {
            <li class="status-text">No questions were asked.</li>
          }
        </ol>
      </section>

      <div class="panel-actions">
        <a class="button-link" routerLink="/join">All your games</a>
      </div>
    }
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameRecapComponent {
  protected readonly session = inject(GameSessionService);
  protected readonly replay = inject(GameReplayService);
  private readonly controls = inject(ControlsPanelService);
  private readonly focus = injectFocusAfterRender();

  protected readonly text = questionText;
  protected readonly clock = clockTime;

  protected readonly outcomeTitle = computed(() => {
    switch (this.session.game()?.outcome) {
      case 'FOUND': return 'The seekers found the hiders';
      case 'ABANDONED': return 'The game was abandoned';
      default: return 'The host ended the game';
    }
  });

  /** The final time, fixed: from setting off to the end, not to now. */
  protected readonly seekingTime = computed(() => {
    const game = this.session.game();
    const duration = game ? seekingDuration(game) : null;
    return duration === null ? null : formatElapsed(duration);
  });

  protected readonly questionSummary = computed(() => {
    const questions = this.session.questions();
    if (questions.length === 0) return 'None';
    const answered = questions.filter(question => question.status === 'ANSWERED').length;
    const unanswered = questions.length - answered;
    return unanswered > 0 ? `${answered} answered · ${unanswered} not` : `${answered} answered`;
  });

  /** Closes the panel, which may cover the map, and starts the replay from the beginning on its slider. */
  protected watchReplay(): void {
    if (this.controls.open()) this.controls.toggle();
    const replay = this.replay.replay();
    if (replay) this.replay.seek(replay.start);
    this.focus('replay-slider');
  }

  protected names(role: 'HIDER' | 'SEEKER'): string {
    return (this.session.game()?.players ?? []).filter(player => player.role === role)
      .map(player => player.displayName).join(', ');
  }

  protected answerOf(question: QuestionDTO): string {
    // A question still waiting when the game ended was never answered
    return question.status === 'PENDING' ? 'Not answered before the end' : answerText(question);
  }

  protected askerName(question: QuestionDTO): string {
    return this.session.game()?.players.find(player => player.id === question.askedBy)?.displayName ?? 'A seeker';
  }
}
