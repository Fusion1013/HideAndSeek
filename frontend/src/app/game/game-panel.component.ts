import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, Injector, input, untracked } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { LayersPanelComponent } from '../layer/layers-panel.component';
import { GameMapService } from './game-map.service';
import { GameSessionService } from './game-session.service';
import { GameViewComponent } from './game-view.component';
import { HidingPanelComponent } from './hiding-panel.component';
import { JoinGameComponent } from './join-game.component';
import { MyGamesComponent } from './my-games.component';
import { QuestionsPanelComponent } from './questions-panel.component';
import { SeekerLocationReporter } from './seeker-location-reporter.service';

/**
 * Game mode: joining a game with its invite code (/join), then playing it (/game/:gameId). The game, its map and
 * the seeker's position sharing live here, for as long as the game page is open, whichever tab is shown.
 */
@Component({
  selector: 'app-game-panel',
  imports: [
    GameViewComponent, HidingPanelComponent, JoinGameComponent, LayersPanelComponent, MyGamesComponent, QuestionsPanelComponent
  ],
  providers: [GameSessionService, GameMapService, SeekerLocationReporter],
  template: `
    @switch (controls.activeMenu()) {
      @case ('game') {
        <div class="menu-content game-panel">
          @if (gameId()) {
            <app-game-view />
          } @else {
            <app-join-game [code]="code()" />
            <app-my-games />
          }
        </div>
      }
      @case ('questions') {
        <div class="menu-content game-panel">
          <app-questions-panel />
        </div>
      }
      @case ('hiding') {
        <div class="menu-content game-panel">
          <app-hiding-panel />
        </div>
      }
      @case ('layers') {
        <app-layers-panel />
      }
    }
  `,
  styleUrl: './game-panel.scss',
  host: { class: 'mode-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class GamePanelComponent {
  protected readonly controls = inject(ControlsPanelService);

  /** From the route /game/:gameId; undefined on /join. */
  readonly gameId = input<string>();
  /** From an invite link, /join?code=... */
  readonly code = input<string>();

  constructor() {
    const injector = inject(Injector);
    const session = injector.get(GameSessionService);

    // Questions once the game has started, for everyone with a role; the hiding tab for hiders
    effect(() => {
      const role = this.gameId() ? session.me()?.role : undefined;
      const started = (session.game()?.status ?? 'LOBBY') !== 'LOBBY';
      this.controls.setAvailable('questions', !!role && started);
      this.controls.setAvailable('hiding', role === 'HIDER');
    });
    inject(DestroyRef).onDestroy(() => {
      this.controls.setAvailable('questions', false);
      this.controls.setAvailable('hiding', false);
    });

    effect(() => {
      const gameId = this.gameId();
      if (!gameId) return;
      untracked(() => {
        session.follow(gameId);
        // Created here rather than by a tab, so the map and the position sharing run whichever tab is open
        injector.get(GameMapService);
        injector.get(SeekerLocationReporter);
      });
    });
  }
}
