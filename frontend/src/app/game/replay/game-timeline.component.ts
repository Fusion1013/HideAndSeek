import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatElapsed } from '../../shared/format';
import { clockTime } from '../game-recap.component';
import { GameReplayService, REPLAY_SPEEDS } from './game-replay.service';

/**
 * The slider along the bottom of the map that replays a finished game: dragging it (or playing it) moves the
 * players along their paths and brings up the questions as they were asked. Marks show when things happened;
 * the buttons beside it step from one to the next.
 */
@Component({
  selector: 'app-game-timeline',
  template: `
    @if (replay.replay(); as data) {
      <section class="timeline" aria-labelledby="timeline-heading">
        <div class="timeline-head">
          <h2 id="timeline-heading">Replay</h2>
          <p class="timeline-time">
            <span class="timeline-elapsed">{{ elapsed() }}</span>
            <span>{{ clock() }}</span>
          </p>
          <ul class="timeline-legend" aria-label="Map key">
            <li><span class="swatch swatch-hider" aria-hidden="true"></span>Hiders</li>
            <li><span class="swatch swatch-seeker" aria-hidden="true"></span>Seekers</li>
            <li><span class="swatch swatch-question" aria-hidden="true"></span>Questions</li>
          </ul>
        </div>

        <div class="timeline-controls">
          <button type="button" class="icon-button" aria-label="Previous event" title="Previous event" (click)="replay.step(-1)">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 5v14M19 5 9 12l10 7z" /></svg>
          </button>
          <button type="button" class="icon-button play-button" [attr.aria-label]="replay.playing() ? 'Pause' : 'Play'"
                  [title]="replay.playing() ? 'Pause' : 'Play'" (click)="replay.togglePlaying()">
            @if (replay.playing()) {
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
            }
          </button>
          <button type="button" class="icon-button" aria-label="Next event" title="Next event" (click)="replay.step(1)">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z" /></svg>
          </button>

          <div class="timeline-track">
            <div class="timeline-marks" aria-hidden="true">
              @for (mark of replay.marks(); track mark.index) {
                <span [class]="'mark mark-' + mark.category" [style.left.%]="mark.fraction * 100"></span>
              }
            </div>
            <input
              id="replay-slider"
              type="range"
              aria-label="Moment of the game"
              [min]="0"
              [max]="data.end - data.start"
              [step]="1000"
              [value]="replay.cursor() - data.start"
              [attr.aria-valuetext]="valueText()"
              (input)="seek($event, data.start)"
            />
          </div>

          <label class="timeline-speed">
            <span class="visually-hidden">Speed</span>
            <select (change)="setSpeed($event)">
              @for (speed of speeds; track speed.factor) {
                <option [value]="speed.factor" [selected]="speed.factor === replay.speed()">{{ speed.label }}</option>
              }
            </select>
          </label>
        </div>

        <p class="timeline-event" aria-live="polite">{{ replay.currentEvent() }}</p>
      </section>
    } @else if (replay.loadFailed()) {
      <p class="timeline timeline-error" role="alert">The replay could not be loaded.</p>
    }
  `,
  styleUrl: './game-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameTimelineComponent {
  protected readonly replay = inject(GameReplayService);
  protected readonly speeds = REPLAY_SPEEDS;

  /** Since the game started: "1:02:05". */
  protected readonly elapsed = computed(() => {
    const data = this.replay.replay();
    return data ? formatElapsed(this.replay.cursor() - data.start) : '';
  });

  protected readonly clock = computed(() => clockTime(new Date(this.replay.cursor()).toISOString()));

  protected readonly valueText = computed(() => `${this.elapsed()} into the game, at ${this.clock()}`);

  protected seek(event: Event, start: number): void {
    this.replay.playing.set(false);
    this.replay.seek(start + Number((event.target as HTMLInputElement).value));
  }

  protected setSpeed(event: Event): void {
    this.replay.speed.set(Number((event.target as HTMLSelectElement).value));
  }
}
