import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import { injectFocusAfterRender } from '../shared/focus';
import { problemDetail } from '../shared/problem-detail';
import { PushNotificationsService, PushState } from './push-notifications.service';

/**
 * The game's notifications on this device: questions to answer, answers, the seekers setting off and the end,
 * for when the game's page is closed or out of sight. Turned on per game.
 */
@Component({
  selector: 'app-game-notifications',
  template: `
    <section class="panel-section" aria-labelledby="notifications-heading">
      <h3 id="notifications-heading" class="panel-heading">Notifications</h3>
      @switch (state()) {
        @case ('loading') {
          <p class="status-text">Checking notifications…</p>
        }
        @case ('unsupported') {
          <p class="status-text">This browser cannot show notifications from Jetlag. Keep this page open to follow the game.</p>
        }
        @case ('install-first') {
          <p class="status-text">
            On iPhone and iPad, notifications only reach Jetlag on the Home Screen: tap Share, then Add to Home Screen,
            and open the game from there.
          </p>
        }
        @case ('blocked') {
          <p class="status-text">Notifications are blocked for this site. Allow them in the browser's site settings, then reload.</p>
        }
        @case ('off') {
          <p class="status-text">Get told on this device when a question waits for your answer, when the hiders answer, and when the game moves on.</p>
          <div class="panel-actions">
            <button id="notifications-on" type="button" [disabled]="busy()" (click)="turnOn()">Turn on notifications</button>
          </div>
        }
        @case ('on') {
          <p class="status-text">On for this game on this device.</p>
          <div class="panel-actions">
            <button id="notifications-off" type="button" [disabled]="busy()" (click)="turnOff()">Turn off</button>
          </div>
        }
      }
      @if (error()) {
        <p class="load-error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameNotificationsComponent {
  readonly gameId = input.required<string>();

  private readonly push = inject(PushNotificationsService);
  protected readonly state = signal<PushState | 'loading'>('loading');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly focus = injectFocusAfterRender();

  constructor() {
    effect(() => {
      const gameId = this.gameId();
      this.state.set('loading');
      this.push.state(gameId).then(
        state => this.state.set(state),
        () => this.state.set('off')
      );
    });
  }

  protected turnOn(): void {
    this.run(() => this.push.turnOn(this.gameId()), 'Notifications could not be turned on.');
  }

  protected turnOff(): void {
    this.run(() => this.push.turnOff(this.gameId()), 'Notifications could not be turned off.');
  }

  private run(action: () => Promise<PushState>, failure: string): void {
    this.busy.set(true);
    this.error.set('');
    action().then(
      state => {
        this.state.set(state);
        // The button pressed gives way to its opposite; focus follows rather than falling to the page
        if (state === 'on' || state === 'off') this.focus(state === 'on' ? 'notifications-off' : 'notifications-on');
      },
      error => this.error.set(problemDetail(error) ?? failure)
    ).finally(() => this.busy.set(false));
  }
}
