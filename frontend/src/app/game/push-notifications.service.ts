import { DOCUMENT, inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

import { PushControllerService } from '../api/generated';

/** Whether this browser can get a game's notifications, and whether it does. */
export type PushState =
  /** No service worker or Push API here (or the app runs without its service worker, as in development). */
  | 'unsupported'
  /** iPhone or iPad in the browser: Safari only sends notifications to the app added to the Home Screen. */
  | 'install-first'
  /** The player said no; only the browser's site settings can undo that. */
  | 'blocked'
  | 'off'
  | 'on';

/**
 * Notifications on the player's device for a game they play: the browser's push subscription, handed to the
 * server per game. A browser has one subscription for every game; turning a game's notifications off only stops
 * the server sending that game's.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly swPush = inject(SwPush);
  private readonly pushApi = inject(PushControllerService);
  private readonly window = inject(DOCUMENT).defaultView;

  /**
   * The game's state for this browser. A subscription the browser has replaced since it was sent is sent again,
   * so notifications keep arriving.
   */
  async state(gameId: string): Promise<PushState> {
    if (!this.swPush.isEnabled) return this.isIosBrowser() ? 'install-first' : 'unsupported';
    if (this.window?.Notification?.permission === 'denied') return 'blocked';
    const [subscription, status] = await Promise.all([
      firstValueFrom(this.swPush.subscription),
      firstValueFrom(this.pushApi.getPushSubscription(gameId))
    ]);
    if (!status.endpoint) return 'off';
    if (subscription && subscription.endpoint !== status.endpoint) {
      await this.send(gameId, subscription);
    }
    return subscription ? 'on' : 'off';
  }

  /** Asks for permission the first time, then has the game's notifications sent here. */
  async turnOn(gameId: string): Promise<PushState> {
    let subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) {
      const { publicKey } = await firstValueFrom(this.pushApi.getPushPublicKey());
      try {
        subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      } catch (error) {
        if (this.window?.Notification?.permission === 'denied') return 'blocked';
        throw error;
      }
    }
    await this.send(gameId, subscription);
    return 'on';
  }

  async turnOff(gameId: string): Promise<PushState> {
    await firstValueFrom(this.pushApi.unsubscribeFromPush(gameId));
    return 'off';
  }

  private async send(gameId: string, subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    await firstValueFrom(this.pushApi.subscribeToPush(gameId, {
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' }
    }));
  }

  /** Safari on iPhone or iPad, outside the Home Screen app (iPads say they are Macs, but have touch). */
  private isIosBrowser(): boolean {
    const navigator = this.window?.navigator;
    if (!navigator) return false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const standalone = this.window?.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !standalone;
  }
}
