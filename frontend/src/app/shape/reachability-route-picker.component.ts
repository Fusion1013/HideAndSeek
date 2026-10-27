import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatDuration } from '../shared/format';
import { normalizeSearchText } from '../transit/route-labels';
import { MAX_ROUTE_TARGETS, ReachabilityRouteService, ROUTE_COLORS } from './reachability-route.service';
import { ReachabilityService } from './reachability.service';

/** The most stations listed at once; the rest are found by searching. */
const MAX_LISTED = 100;

/** Picks reachable stations to show the quickest route to: a searchable list to tick, with the picked ones above it. */
@Component({
  selector: 'app-reachability-route-picker',
  template: `
    <fieldset class="route-picker">
      <legend class="panel-heading">
        Routes to stations
        <span>{{ routes.selected().length }} picked</span>
      </legend>

      @if (picked().length > 0) {
        <ul class="picked-list" aria-label="Picked stations">
          @for (station of picked(); track station.stopId) {
            <li>
              <span class="layer-swatch" [style.background-color]="station.color" aria-hidden="true"></span>
              <span class="picked-name">{{ station.name }}</span>
              <button type="button" class="remove-button" [attr.aria-label]="'Remove ' + station.name"
                (click)="routes.setSelected(station.stopId, false)">✕</button>
            </li>
          }
        </ul>
        <div class="panel-actions">
          <button type="button" (click)="routes.clearSelected()">Remove all</button>
        </div>
      }

      <label class="control-field" for="reachability-route-search">
        Find a reachable station
        <input id="reachability-route-search" type="search" autocomplete="off" placeholder="Station name"
          [value]="search()" (input)="setSearch($event)">
      </label>
      <p class="status-text" aria-live="polite">
        @if (matches().length > listed().length) {
          Showing {{ listed().length }} of {{ matches().length }}, soonest first. Search to narrow.
        } @else {
          {{ matches().length }} {{ matches().length === 1 ? 'station' : 'stations' }}
        }
        @if (full()) {
          · At most {{ maxTargets }} can be picked.
        }
      </p>
      <ul class="station-checklist" aria-label="Reachable stations">
        @for (station of listed(); track station.stopId) {
          <li>
            <label>
              <input type="checkbox" [checked]="selectedIds().has(station.stopId)"
                [disabled]="full() && !selectedIds().has(station.stopId)"
                (change)="toggle(station.stopId, $event)">
              <span class="station-name">
                {{ station.name }}
                <span class="station-note">
                  {{ station.arrival }}
                  @if (!station.likely) {
                    · <span class="unlikely-note">unlikely</span>
                  }
                </span>
              </span>
            </label>
          </li>
        }
      </ul>
    </fieldset>
  `,
  styles: `
    :host {
      display: contents;
    }

    .route-picker {
      display: grid;
      gap: 8px;
      min-width: 0;
      margin: 0;
      padding: 8px 0 0;
      border: 0;
      border-top: 1px solid var(--control-border);
    }

    legend {
      float: left;
      width: 100%;
      padding: 0;
      font-size: 14px;
      font-weight: 700;
    }

    .picked-list,
    .station-checklist {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .picked-list li {
      display: flex;
      min-height: 32px;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .picked-name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .remove-button {
      flex: none;
      width: 32px;
      height: 32px;
      padding: 0;
    }

    .station-checklist {
      max-height: 32dvh;
      // Room for the checkbox focus outline, which the scroll container would otherwise clip
      padding: 0 6px;
      margin-inline: -6px;
      overflow-y: auto;
      overscroll-behavior: contain;

      label {
        display: flex;
        min-height: 32px;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid var(--control-border);
        color: var(--control-ink);
        font-size: 14px;
        cursor: pointer;
      }

      input {
        flex: none;
        width: 18px;
        height: 18px;
        margin: 0;
      }
    }

    .station-name {
      min-width: 0;
      padding-block: 4px;
      overflow-wrap: anywhere;
    }

    .station-note {
      display: block;
      color: var(--control-muted);
      font-size: 12px;
    }

    .unlikely-note {
      color: var(--control-warning-ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReachabilityRoutePickerComponent {
  private readonly reachability = inject(ReachabilityService);
  protected readonly routes = inject(ReachabilityRouteService);

  protected readonly maxTargets = MAX_ROUTE_TARGETS;
  protected readonly search = signal('');

  protected readonly selectedIds = computed<ReadonlySet<string>>(() => new Set(this.routes.selected()));
  protected readonly full = computed(() => this.routes.selected().length >= MAX_ROUTE_TARGETS);

  /** Every reachable station but the one travelled from, soonest first, as the backend sorts them. */
  private readonly candidates = computed(() => {
    const originId = this.reachability.origin()?.stopId;
    return this.reachability.stations()
      .filter(station => station.stopId !== originId && station.earliestArrivalSeconds > 0)
      .map(station => ({
        stopId: station.stopId,
        name: station.stopName || station.stopId,
        likely: station.likely,
        arrival: `in ${formatDuration(station.likelyArrivalSeconds ?? station.earliestArrivalSeconds)}`,
        searchText: normalizeSearchText(station.stopName ?? '')
      }));
  });

  protected readonly matches = computed(() => {
    const search = normalizeSearchText(this.search());
    return search ? this.candidates().filter(station => station.searchText.includes(search)) : this.candidates();
  });

  protected readonly listed = computed(() => this.matches().slice(0, MAX_LISTED));

  /** The picked stations in the order picked, with their colors on the map. */
  protected readonly picked = computed(() => {
    const names = new Map(this.candidates().map(station => [station.stopId, station.name] as const));
    return this.routes.selected().map((stopId, index) => ({
      stopId,
      name: names.get(stopId) ?? stopId,
      color: ROUTE_COLORS[index % ROUTE_COLORS.length]
    }));
  });

  protected toggle(stopId: string, event: Event): void {
    this.routes.setSelected(stopId, (event.target as HTMLInputElement).checked);
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
}
