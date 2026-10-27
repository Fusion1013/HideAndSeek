import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { formatElapsed } from '../shared/format';
import { GameSessionService } from './game-session.service';

/**
 * The game's clocks, ticking each second: the hiding time left, and how long the seekers have been seeking.
 * One per game page, shared by the game tab and the status on the map.
 */
@Injectable()
export class GameClock {
  private readonly session = inject(GameSessionService);

  /** The device's clock. */
  private readonly now = signal(Date.now());

  private readonly remainingMs = computed(() => {
    const endsAt = this.session.game()?.hidingEndsAt;
    return endsAt ? Math.max(0, Date.parse(endsAt) - this.session.serverNow(this.now())) : 0;
  });

  /** The hiding time left: "12:05", or "1:02:05" for over an hour. Rounded up, so it reaches 0:00 as time runs out. */
  readonly countdown = computed(() => formatElapsed(Math.ceil(this.remainingMs() / 1000) * 1000));

  /** How long the seekers have been seeking, counting up from the moment they set off. */
  readonly seekingTime = computed(() => {
    const startedAt = this.session.game()?.seekingStartedAt;
    return startedAt ? formatElapsed(this.session.serverNow(this.now()) - Date.parse(startedAt)) : '';
  });

  /** The clock that matters in the current phase, or '' outside hiding and seeking. */
  readonly phaseTime = computed(() => {
    switch (this.session.game()?.status) {
      case 'HIDING': return this.countdown();
      case 'SEEKING': return this.seekingTime();
      default: return '';
    }
  });

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }
}
