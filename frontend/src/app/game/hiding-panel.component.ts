import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import type { StationDTO } from '../api/generated';
import { normalizeSearchText } from '../transit/route-labels';
import { injectFocusAfterRender } from '../shared/focus';
import { GameMapService } from './game-map.service';
import { GameSessionService } from './game-session.service';

/** How many stations the list shows before asking for a search, so a large game stays quick to read. */
const MAX_LISTED = 50;

/**
 * The hiders' tab: where they hide, and choosing or changing it during the hiding time, from the list or by
 * clicking a station on the map. Only offered to hiders.
 */
@Component({
  selector: 'app-hiding-panel',
  template: `
    <section class="panel-section" aria-labelledby="hiding-heading">
      <h3 id="hiding-heading" class="panel-heading" tabindex="-1">Hiding station</h3>
      <div role="status">
        @if (session.hidingStation(); as chosen) {
          <p class="hiding-choice"><span class="status-text">You hide at</span>&ngsp;<strong>{{ chosen.station.name }}</strong></p>
        } @else {
          <p class="status-text">{{ session.canChooseStation() ? 'Not chosen yet.' : 'No station was chosen.' }}</p>
        }
      </div>

      @if (session.game()?.status === 'LOBBY') {
        <p class="status-text">You choose the station once the game starts.</p>
      } @else if (!session.canChooseStation()) {
        <p class="status-text">The hiding time is over; the station can no longer change.</p>
      }
    </section>

    @if (session.canChooseStation()) {
      @if (map.pickedStation(); as picked) {
        <section class="panel-section picked" aria-labelledby="picked-heading">
          <h3 id="picked-heading" class="panel-heading">{{ picked.name }}</h3>
          <div class="panel-actions">
            <button type="button" class="primary-action" [disabled]="session.busy() || isChosen(picked)" (click)="choose(picked)">
              {{ isChosen(picked) ? 'Your station' : 'Hide here' }}
            </button>
            <button type="button" (click)="map.pickedStation.set(null)">Close</button>
          </div>
        </section>
      }

      <section class="panel-section" aria-labelledby="stations-heading">
        <div class="panel-heading">
          <h3 id="stations-heading">Stations</h3>
          <span>{{ session.stations().length }}</span>
        </div>
        <p class="status-text">Choose from the list, or click a station on the map.</p>
        <div class="control-field">
          <label for="station-search">Search stations</label>
          <input id="station-search" type="search" autocomplete="off" [value]="search()" (input)="setSearch($event)">
        </div>
        <ul class="station-list">
          @for (station of shown(); track station.stationId) {
            <li>
              <span>{{ station.name }}</span>
              <!-- The visible words start the accessible name (WCAG 2.5.3); the station completes it -->
              <button type="button" [disabled]="session.busy() || isChosen(station)" (click)="choose(station)">
                {{ isChosen(station) ? 'Chosen' : 'Hide here' }}<span class="visually-hidden">: {{ station.name }}</span>
              </button>
            </li>
          }
        </ul>
        @if (matching().length > shown().length) {
          <p class="status-text">{{ matching().length - shown().length }} more; search to narrow the list.</p>
        }
      </section>
    }

    @if (session.error()) {
      <p class="load-error" role="alert">{{ session.error() }}</p>
    }
  `,
  styleUrl: './game-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HidingPanelComponent {
  protected readonly session = inject(GameSessionService);
  protected readonly map = inject(GameMapService);
  private readonly focus = injectFocusAfterRender();

  protected readonly search = signal('');

  protected readonly matching = computed(() => {
    const search = normalizeSearchText(this.search());
    return this.session.stations().filter(station => !search || normalizeSearchText(station.name).includes(search));
  });
  protected readonly shown = computed(() => this.matching().slice(0, MAX_LISTED));

  protected isChosen(station: StationDTO): boolean {
    return this.session.hidingStation()?.station.stationId === station.stationId;
  }

  protected choose(station: StationDTO): void {
    this.session.chooseHidingStation(station.stationId);
    // The picked station's box closes; the choice is shown at the top
    if (this.map.pickedStation()) this.focus('hiding-heading');
    this.map.pickedStation.set(null);
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
}
