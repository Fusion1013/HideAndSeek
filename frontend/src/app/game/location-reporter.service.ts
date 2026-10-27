import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';

import { GamePlayControllerService } from '../api/generated';
import { GeolocationService, GeoPosition } from '../position/geolocation.service';
import { GameSessionService } from './game-session.service';

/** Positions closer together than this are not sent; the server would not pass them on anyway. */
export const MIN_SEND_INTERVAL_MS = 10_000;
/** The position is sent again this often while it does not change, so hiders can tell a seeker's is still current. */
export const RESEND_INTERVAL_MS = 30_000;

/**
 * Sends the player's GPS position while the game runs (hiding and seeking). A seeker's is shared with the hiders;
 * a hider's is shown to nobody until the game is over, in its replay. One per game page.
 */
@Injectable()
export class LocationReporter {
  private readonly session = inject(GameSessionService);
  private readonly geolocation = inject(GeolocationService);
  private readonly playApi = inject(GamePlayControllerService);

  private lastSentAt = 0;

  /** Whether this player's position is being shared now. */
  readonly sharing = computed(() => {
    const status = this.session.game()?.status;
    return !!this.session.me()?.role && (status === 'HIDING' || status === 'SEEKING');
  });
  readonly gpsError = this.geolocation.error;
  readonly hasPosition = computed(() => this.geolocation.position() !== null);
  /** The last position could not be sent; the next one will try again. */
  readonly sendFailed = signal(false);

  constructor() {
    let release: (() => void) | null = null;
    effect(() => {
      const sharing = this.sharing();
      untracked(() => {
        if (sharing && !release) {
          release = this.geolocation.track();
        } else if (!sharing && release) {
          release();
          release = null;
        }
      });
    });

    effect(() => {
      const position = this.geolocation.position();
      if (position && untracked(this.sharing)) untracked(() => this.send(position, false));
    });

    const resend = setInterval(() => {
      const position = this.geolocation.position();
      if (position && this.sharing()) this.send(position, true);
    }, RESEND_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(resend);
      release?.();
    });
  }

  private send(position: GeoPosition, force: boolean): void {
    const game = this.session.game();
    const now = Date.now();
    if (!game || (!force && now - this.lastSentAt < MIN_SEND_INTERVAL_MS)) return;
    this.lastSentAt = now;
    this.playApi.reportLocation(game.id, {
      longitude: position.longitude,
      latitude: position.latitude,
      accuracyMeters: position.accuracyMeters
    }).subscribe({
      next: () => this.sendFailed.set(false),
      error: () => this.sendFailed.set(true)
    });
  }
}
