import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, inject, input, signal, untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { PlayerAccessControllerService } from '../api/generated';
import type { GameDTO } from '../api/generated';
import { problemDetail } from '../shared/problem-detail';
import { clockTime } from './game-recap.component';

/** Where a rejoin link's code goes: in the fragment, so it never reaches a server's logs. */
export const REJOIN_FRAGMENT_PREFIX = 'rejoin=';

/** The code in a game page's fragment, from a rejoin link, if there is one. */
export function rejoinCode(fragment: string | null | undefined): string | undefined {
  return fragment?.startsWith(REJOIN_FRAGMENT_PREFIX) ? fragment.slice(REJOIN_FRAGMENT_PREFIX.length) || undefined : undefined;
}

interface MadeLink {
  playerName: string;
  url: string;
  expiresAt: string;
}

/**
 * The host's way back in for a player whose browser forgot them: a one-time link, made for one player, that puts
 * them back in the game on whatever browser or device opens it.
 */
@Component({
  selector: 'app-rejoin-link',
  imports: [ReactiveFormsModule],
  template: `
    <section class="panel-section" aria-labelledby="rejoin-heading">
      <h3 id="rejoin-heading" class="panel-heading">Someone lost their place?</h3>
      <p class="status-text">
        Make them a link that puts them back in the game on any phone or browser. It works once, for 30 minutes,
        and whoever has their place now loses it.
      </p>
      <div class="control-field">
        <label for="rejoin-player">Player</label>
        <select id="rejoin-player" [formControl]="player">
          @for (option of game().players; track option.id) {
            <option [value]="option.id">{{ option.displayName }}</option>
          }
        </select>
      </div>
      <div class="panel-actions">
        <button type="button" [disabled]="busy()" (click)="make()">{{ busy() ? 'Making the link…' : 'Make rejoin link' }}</button>
      </div>
      @if (error()) {
        <p class="load-error" role="alert">{{ error() }}</p>
      }
      @if (made(); as link) {
        <div class="control-field">
          <label for="rejoin-url">Link for {{ link.playerName }}, works once until {{ expiresAt() }}</label>
          <input id="rejoin-url" type="text" readonly [value]="link.url" (focus)="selectAll($event)">
        </div>
        <div class="panel-actions">
          <button type="button" (click)="copy(link.url)">Copy link</button>
          @if (canShare) {
            <button type="button" (click)="share(link)">Share…</button>
          }
          <span class="status-text" role="status">{{ copyStatus() }}</span>
        </div>
      }
    </section>
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RejoinLinkComponent {
  private readonly accessApi = inject(PlayerAccessControllerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = inject(DOCUMENT).defaultView;

  readonly game = input.required<GameDTO>();
  /** The host, who the list does not start at. */
  readonly myPlayerId = input<string | null>(null);

  protected readonly player = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly copyStatus = signal('');
  protected readonly made = signal<MadeLink | null>(null);
  protected readonly expiresAt = computed(() => {
    const made = this.made();
    return made ? clockTime(made.expiresAt) : '';
  });
  protected readonly canShare = typeof this.window?.navigator.share === 'function';

  constructor() {
    // Starts at the first player who is not the host, as the host is rarely the one who needs it; and moves on
    // from a player who is no longer in the list
    effect(() => {
      const players = this.game().players;
      const myPlayerId = this.myPlayerId();
      untracked(() => {
        if (players.some(player => player.id === this.player.value)) return;
        this.player.setValue((players.find(player => player.id !== myPlayerId) ?? players[0])?.id ?? '');
      });
    });
  }

  protected make(): void {
    const game = this.game();
    const target = game.players.find(candidate => candidate.id === this.player.value);
    const origin = this.window?.location.origin;
    if (!target || !origin) return;
    this.busy.set(true);
    this.error.set('');
    this.copyStatus.set('');
    this.accessApi.createRejoinCode(game.id, target.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ code, expiresAt }) => {
        this.busy.set(false);
        this.made.set({
          playerName: target.displayName,
          url: `${origin}/game/${game.id}#${REJOIN_FRAGMENT_PREFIX}${code}`,
          expiresAt
        });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemDetail(error) ?? 'The link could not be made. Check the connection and try again.');
      }
    });
  }

  protected async copy(url: string): Promise<void> {
    try {
      await this.window?.navigator.clipboard.writeText(url);
      this.copyStatus.set('Link copied.');
    } catch {
      this.copyStatus.set('Copying failed. Select the link and copy it by hand.');
    }
  }

  protected async share(link: MadeLink): Promise<void> {
    try {
      await this.window?.navigator.share({ title: `Rejoin ${this.game().name}`, url: link.url });
    } catch {
      // Cancelled, or not allowed here: the link is still shown to copy
    }
  }

  protected selectAll(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }
}
