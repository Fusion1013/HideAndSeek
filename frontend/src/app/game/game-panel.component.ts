import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, input, untracked } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { ClosestLocationsService } from '../distance/closest-locations.service';
import { DistancesPanelComponent } from '../distance/distances-panel.component';
import { injectFocusAfterRender } from '../shared/focus';
import { LayersPanelComponent } from '../layer/layers-panel.component';
import { MapOverlayService } from '../map/map-overlay.service';
import { MeasurePanelComponent } from '../shape/measure-panel.component';
import { GameClock } from './game-clock.service';
import { GameMapService } from './game-map.service';
import { GameSessionService } from './game-session.service';
import { GameStatusComponent } from './game-status.component';
import { GameViewComponent } from './game-view.component';
import { HidingPanelComponent } from './hiding-panel.component';
import { JoinGameComponent } from './join-game.component';
import { MyGamesComponent } from './my-games.component';
import { QuestionsPanelComponent } from './questions-panel.component';
import { GameReplayService } from './replay/game-replay.service';
import { GameTimelineComponent } from './replay/game-timeline.component';
import { LocationReporter } from './location-reporter.service';

/**
 * Game mode: joining a game with its invite code (/join), then playing it (/game/:gameId). The game, its map and
 * the seeker's position sharing live here, for as long as the game page is open, whichever tab is shown.
 */
@Component({
  selector: 'app-game-panel',
  imports: [
    DistancesPanelComponent, GameViewComponent, HidingPanelComponent, JoinGameComponent, LayersPanelComponent, MeasurePanelComponent,
    MyGamesComponent, QuestionsPanelComponent
  ],
  providers: [GameSessionService, GameClock, GameReplayService, GameMapService, LocationReporter],
  template: `
    @switch (controls.activeMenu()) {
      @case ('game') {
        <div class="menu-content">
          @if (gameId()) {
            <app-game-view />
          } @else {
            <app-join-game [code]="code()" />
            <app-my-games />
          }
        </div>
      }
      @case ('questions') {
        <div class="menu-content">
          <app-questions-panel />
        </div>
      }
      @case ('hiding') {
        <div class="menu-content">
          <app-hiding-panel />
        </div>
      }
      @case ('measure') {
        <app-measure-panel [stationDistances]="false" />
      }
      @case ('distances') {
        <app-distances-panel />
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
    // What waits for the player is marked on its tab: a question for the hiders to answer, a station to choose
    effect(() => {
      const hider = session.me()?.role === 'HIDER';
      this.controls.setAttention('questions', hider && !!session.pendingQuestion());
      this.controls.setAttention('hiding', session.canChooseStation() && !session.hidingStation());
    });
    // When the game finishes, its recap is shown, wherever the player was, and focus moves to it: whatever
    // they were using has gone
    const focus = injectFocusAfterRender();
    let wasFinished: boolean | undefined;
    effect(() => {
      const finished = session.game()?.status === 'FINISHED';
      if (finished && wasFinished === false) {
        untracked(() => this.controls.show('game'));
        focus('recap-heading');
      }
      if (session.game()) wasFinished = finished;
    });

    // A running game's phase and clock, over the map, for when the panel is closed
    const mapOverlay = inject(MapOverlayService);
    const running = computed(() => {
      const status = session.game()?.status;
      return !!this.gameId() && (status === 'HIDING' || status === 'SEEKING');
    });
    effect(onCleanup => {
      if (!running()) return;
      onCleanup(untracked(() => mapOverlay.show({ component: GameStatusComponent, injector }, 'status')));
    });

    // A finished game's replay slider, along the bottom of the map
    const finished = computed(() => !!this.gameId() && session.game()?.status === 'FINISHED');
    effect(onCleanup => {
      if (!finished()) return;
      onCleanup(untracked(() => mapOverlay.show({ component: GameTimelineComponent, injector })));
    });

    // Out playing, the nearest places are measured from where the player is, not from the mouse
    const closest = inject(ClosestLocationsService);
    const overviewSource = closest.positionSource();
    closest.positionSource.set('gps');

    inject(DestroyRef).onDestroy(() => {
      this.controls.setAvailable('questions', false);
      this.controls.setAvailable('hiding', false);
      this.controls.setAttention('questions', false);
      this.controls.setAttention('hiding', false);
      closest.positionSource.set(overviewSource);
    });

    effect(() => {
      const gameId = this.gameId();
      if (!gameId) return;
      untracked(() => {
        session.follow(gameId);
        // Created here rather than by a tab, so the map and the position sharing run whichever tab is open
        injector.get(GameMapService);
        injector.get(LocationReporter);
      });
    });
  }
}
