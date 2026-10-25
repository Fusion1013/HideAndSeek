import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PlayerDTO } from '../api/generated';
import type { GeolocationError } from '../position/geolocation.service';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { injectFocusAfterRender } from '../shared/focus';
import { GameMapService } from './game-map.service';
import { GameRole, GameSessionService } from './game-session.service';
import { questionText } from './questions';
import { SeekerLocationReporter } from './seeker-location-reporter.service';

const ROLE_LABELS: Record<GameRole, string> = { SEEKER: 'Seeker', HIDER: 'Hider' };

/**
 * One game: its phase, the invite code while in the lobby, the players and their roles, the seekers for the hiders,
 * position sharing for the seekers, and the host's controls. The game itself comes from the page.
 */
@Component({
  selector: 'app-game-view',
  imports: [RouterLink],
  template: `
    @if (session.loading()) {
      <p class="status-text">Loading the game…</p>
    } @else if (session.access() === 'no-token') {
      <p class="load-error" role="alert">This browser has not joined this game.</p>
      <p class="status-text"><a routerLink="/join">Join it with its invite code</a></p>
    } @else if (session.access() === 'refused') {
      <p class="load-error" role="alert">This browser's place in the game is no longer valid.</p>
    } @else if (session.access() === 'not-found') {
      <p class="load-error" role="alert">There is no game at this address.</p>
    } @else if (session.access() === 'failed') {
      <p class="load-error" role="alert">The game could not be loaded. Trying again…</p>
    }

    @if (session.game(); as game) {
      <section class="game-section" aria-labelledby="game-heading">
        <div class="panel-heading">
          <h3 id="game-heading">{{ game.name }}</h3>
          <span>{{ game.stationCount }} stations · {{ game.routes.length }} routes</span>
        </div>

        <div [class]="'phase phase-' + game.status.toLowerCase()">
          <p class="phase-title">{{ phaseTitle() }}</p>
          @if (game.status === 'HIDING') {
            <p class="countdown" aria-hidden="true">{{ countdown() }}</p>
          }
          @if (roleHint()) {
            <p class="phase-hint">{{ roleHint() }}</p>
          }
        </div>
        <p class="visually-hidden" role="status">{{ phaseAnnouncement() }}</p>
        <p class="status-text connection-status" role="status">
          @if (session.connection() === 'reconnecting') {
            Connection lost. Reconnecting; nothing that happens meanwhile is lost.
          }
        </p>
      </section>

      @if (session.me()?.role === 'HIDER' && session.pendingQuestion(); as question) {
        <section class="game-section waiting-question" aria-labelledby="waiting-heading">
          <h3 id="waiting-heading" class="panel-heading">A question is waiting for your answer</h3>
          <p class="question-text">{{ questionText(question) }}</p>
          <div class="panel-actions">
            <button type="button" class="primary-action" (click)="openQuestions()">Answer it</button>
          </div>
        </section>
      }

      @if (reporter.sharing()) {
        <section class="game-section" aria-labelledby="sharing-heading">
          <h3 id="sharing-heading" class="panel-heading">Your position</h3>
          @if (reporter.gpsError(); as gpsError) {
            <p class="load-error" role="alert">{{ gpsErrorMessage(gpsError) }}</p>
          } @else if (reporter.sendFailed()) {
            <p class="load-error" role="alert">Your position could not be sent. Trying again…</p>
          } @else {
            <p class="status-text">{{ reporter.hasPosition() ? 'Shared with the hiders while the game runs.' : 'Finding your position…' }}</p>
          }
        </section>
      }

      @if (session.me()?.role === 'HIDER' && game.status !== 'LOBBY') {
        <section class="game-section" aria-labelledby="seekers-heading">
          <h3 id="seekers-heading" class="panel-heading">Seekers last seen</h3>
          @for (seeker of map.seekers(); track seeker.playerId) {
            <p class="seeker-line"><strong>{{ seeker.displayName }}</strong>&ngsp;<span class="status-text">{{ seeker.age }}</span></p>
          } @empty {
            <p class="status-text">No seeker has shared a position yet.</p>
          }
        </section>
      }

      @if (game.status === 'LOBBY') {
        <section class="game-section" aria-labelledby="invite-heading">
          <h3 id="invite-heading" class="panel-heading">Invite players</h3>
          <p class="invite-code" aria-label="Invite code {{ spokenCode() }}">{{ game.inviteCode }}</p>
          <div class="panel-actions">
            <button type="button" (click)="copyInviteLink()">Copy invite link</button>
            <span class="status-text" role="status">{{ copyStatus() }}</span>
          </div>
        </section>
      }

      <section class="game-section" aria-labelledby="players-heading">
        <div class="panel-heading">
          <h3 id="players-heading">Players</h3>
          <span>{{ game.players.length }}</span>
        </div>
        <ul class="player-list">
          @for (player of game.players; track player.id) {
            <li>
              <span class="player-name">
                {{ player.displayName }}
                @if (player.id === session.myPlayerId()) {&ngsp;<span class="player-tag">you</span>}
                @if (player.host) {&ngsp;<span class="player-tag">host</span>}
              </span>
              @if (session.isHost() && game.status === 'LOBBY') {
                <select [attr.aria-label]="'Role of ' + player.displayName" [value]="player.role ?? ''"
                  [disabled]="session.busy()" (change)="setRole(player, $event)">
                  <option value="">No role</option>
                  <option value="SEEKER">Seeker</option>
                  <option value="HIDER">Hider</option>
                </select>
              } @else {
                <span class="player-role">{{ roleLabel(player.role) }}</span>
              }
            </li>
          }
        </ul>
      </section>

      @if (session.error()) {
        <p class="load-error" role="alert">{{ session.error() }}</p>
      }

      @if (session.isHost() && game.status !== 'FINISHED') {
        <section class="game-section" aria-label="Host controls">
          @if (game.status === 'LOBBY') {
            <div class="panel-actions">
              <button type="button" class="primary-action" aria-describedby="start-blockers"
                [disabled]="session.busy() || session.startBlockers().length > 0" (click)="session.start()">
                Start the game
              </button>
            </div>
            <ul id="start-blockers" class="start-blockers">
              @for (blocker of session.startBlockers(); track blocker) {
                <li>{{ blocker }}</li>
              } @empty {
                <li>Ready. The hiders get {{ game.hidingMinutes }} {{ game.hidingMinutes === 1 ? 'minute' : 'minutes' }} once the game starts.</li>
              }
            </ul>
          }
          @if (confirmingEnd()) {
            <div class="confirm-box" role="group" aria-labelledby="end-question">
              <p id="end-question">End the game for everyone?</p>
              <div class="panel-actions">
                <button type="button" class="danger-action" [disabled]="session.busy()" (click)="endGame()">End game</button>
                <button id="end-keep" type="button" (click)="askToEnd(false)">Keep playing</button>
              </div>
            </div>
          } @else {
            <div class="panel-actions">
              <button id="end-ask" type="button" [disabled]="session.busy()" (click)="askToEnd(true)">End game…</button>
            </div>
          }
        </section>
      }
    }
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameViewComponent {
  protected readonly session = inject(GameSessionService);
  protected readonly map = inject(GameMapService);
  protected readonly reporter = inject(SeekerLocationReporter);
  protected readonly controls = inject(ControlsPanelService);
  protected readonly questionText = questionText;
  private readonly document = inject(DOCUMENT);
  private readonly focus = injectFocusAfterRender();

  protected readonly confirmingEnd = signal(false);
  protected readonly copyStatus = signal('');
  /** The device's clock, ticking each second for the countdown. */
  private readonly now = signal(Date.now());

  protected readonly phaseTitle = computed(() => {
    switch (this.session.game()?.status) {
      case 'LOBBY': return this.session.isHost() ? 'Waiting for players' : 'Waiting for the host to start';
      case 'HIDING': return 'The hiders are hiding';
      case 'SEEKING': return 'The seekers are on their way';
      case 'FINISHED': return 'The game is over';
      default: return '';
    }
  });

  /** What the phase means for this player. */
  protected readonly roleHint = computed(() => {
    const status = this.session.game()?.status;
    const role = this.session.me()?.role;
    if (status === 'LOBBY' && this.session.isHost()) return 'Give everyone a role, then start the game.';
    if (status === 'LOBBY') return role ? `You will be a ${ROLE_LABELS[role].toLowerCase()}.` : 'The host gives everyone a role.';
    if (status === 'HIDING') {
      if (role !== 'HIDER') return 'Wait here until the hiders\' time is up.';
      return this.session.hidingStation()
        ? 'Get to your hiding station before the time runs out.'
        : 'Choose your hiding station in the Hiding station tab.';
    }
    if (status === 'SEEKING') return role === 'HIDER' ? 'Stay hidden.' : 'Find the hiders.';
    return '';
  });

  private readonly remainingMs = computed(() => {
    const endsAt = this.session.game()?.hidingEndsAt;
    return endsAt ? Math.max(0, Date.parse(endsAt) - this.session.serverNow(this.now())) : 0;
  });

  /** "12:05", or "1:02:05" for over an hour. */
  protected readonly countdown = computed(() => {
    const total = Math.ceil(this.remainingMs() / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const seconds = total % 60;
    const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`;
    return hours > 0 ? `${hours}:${mmss}` : mmss;
  });

  protected readonly hidingEndsAtLabel = computed(() => {
    const endsAt = this.session.game()?.hidingEndsAt;
    return endsAt ? new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  });

  /** Said once by screen readers when the phase changes, instead of the countdown ticking. */
  protected readonly phaseAnnouncement = computed(() => this.session.game()?.status === 'HIDING'
    ? `${this.phaseTitle()}. The seekers set off at ${this.hidingEndsAtLabel()}.`
    : this.phaseTitle());

  /** The code letter by letter, so screen readers do not try to say it as a word. */
  protected readonly spokenCode = computed(() => (this.session.game()?.inviteCode ?? '').split('').join(' '));

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }

  protected gpsErrorMessage(error: GeolocationError): string {
    switch (error) {
      case 'unsupported': return 'This browser cannot provide a GPS position, so the hiders cannot see where you are.';
      case 'insecure-context': return 'GPS needs a secure connection. Open this site with https:// to share your position.';
      case 'permission-denied': return 'Location access was denied. Allow it in the browser so the hiders can see where you are.';
      case 'timeout': return 'Getting a GPS position took too long. Still trying...';
      case 'unavailable': return 'Your position is currently unavailable. Still trying...';
    }
  }

  protected roleLabel(role: GameRole | undefined): string {
    return role ? ROLE_LABELS[role] : 'No role yet';
  }

  protected setRole(player: PlayerDTO, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.session.setRole(player.id, value === 'SEEKER' || value === 'HIDER' ? value : null);
  }

  /** Shows or hides the confirmation, moving focus to its safe choice or back to the button that opened it. */
  protected askToEnd(confirming: boolean): void {
    this.confirmingEnd.set(confirming);
    this.focus(confirming ? 'end-keep' : 'end-ask');
  }

  protected openQuestions(): void {
    this.controls.show('questions');
    this.focus('pending-heading');
  }

  protected endGame(): void {
    this.confirmingEnd.set(false);
    this.session.end();
  }

  protected async copyInviteLink(): Promise<void> {
    const game = this.session.game();
    const origin = this.document.defaultView?.location.origin;
    if (!game || !origin) return;
    const link = `${origin}/join?code=${game.inviteCode}`;
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(link);
      this.copyStatus.set('Link copied.');
    } catch {
      this.copyStatus.set(`Copy this link: ${link}`);
    }
  }
}
