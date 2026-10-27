import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { isNonEmptyString } from '../shared/guards';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { RouteChecklistComponent } from '../transit/route-checklist.component';
import { compareText, normalizeSearchText, routeTypeLabel } from '../transit/route-labels';
import { TemplateEditorService } from './template-editor.service';

/** A route the picker can list: from the timetable, or (if the timetable dropped it) as the template saved it. */
interface PickableRoute {
  routeId: string;
  label: string;
  routeType: string | undefined;
  /** False for a saved route the current timetable no longer has. */
  available: boolean;
  /** False for a chosen route that serves no stop inside the area (e.g. the area shrank). */
  inArea: boolean;
  /** Why a chosen route may not count: no longer in the timetable, or outside the area. */
  note: string | undefined;
  searchText: string;
}

/** The routes that count in a game from this template: those serving stops inside the area, to tick. */
@Component({
  selector: 'app-template-route-picker',
  imports: [RouteChecklistComponent],
  template: `
    @if (!editor.canEdit()) {
      <!-- Read-only: just the chosen routes, as a list that can be scrolled by keyboard -->
      <section class="panel-section" aria-labelledby="chosen-routes-heading">
        <h3 id="chosen-routes-heading" class="panel-heading">Routes <span>{{ editor.routeIds().length }} chosen</span></h3>
        <app-route-checklist [routes]="chosenRoutes()" label="Chosen routes" [readOnly]="true" emptyText="No routes chosen." />
      </section>
    } @else {
    <fieldset class="panel-section" [disabled]="editor.busy()">
      <legend class="panel-heading">
        Routes
        <span>{{ editor.routeIds().length }} chosen · {{ editor.routeIdsInArea().size }} in area</span>
      </legend>

      @if (!editor.area()) {
        <p class="status-text">Set the play area first; the routes serving its stops are listed here.</p>
      } @else {
        <div class="route-filter-row">
          <label class="control-field" for="template-route-search">
            Search
            <input id="template-route-search" type="search" placeholder="Name, agency, or route ID"
              [value]="search()" (input)="setSearch($event)">
          </label>
          <label class="control-field" for="template-route-type">
            Mode
            <select id="template-route-type" [value]="routeType()" (change)="setRouteType($event)">
              <option value="">All modes</option>
              @for (type of routeTypes(); track type) {
                <option [value]="type">{{ routeTypeLabel(type) }}</option>
              }
            </select>
          </label>
        </div>
        <label class="check-field">
          <input type="checkbox" [checked]="chosenOnly()" (change)="setChosenOnly($event)">
          Only chosen routes
        </label>
        <div class="panel-actions">
          <button type="button" [disabled]="shown().length === 0" (click)="chooseShown()">Choose shown</button>
          <button type="button" [disabled]="shown().length === 0" (click)="unchooseShown()">Remove shown</button>
        </div>

        @if (editor.routesInAreaLoading()) {
          <p class="status-text" role="status">Finding the routes in the area…</p>
        } @else if (editor.routesInAreaFailed()) {
          <p class="load-error" role="alert">The routes in the area could not be loaded.</p>
        }

        <p class="status-text" aria-live="polite">{{ shown().length }} shown</p>
        <app-route-checklist [routes]="shown()" [chosen]="chosen()" label="Routes in the play area"
          (toggled)="toggle($event.routeId, $event.chosen)" />
      }
    </fieldset>
    }
  `,
  styleUrl: './create-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateRoutePickerComponent {
  protected readonly editor = inject(TemplateEditorService);
  private readonly catalog = inject(RouteCatalogService);

  protected readonly search = signal('');
  protected readonly routeType = signal('');
  protected readonly chosenOnly = signal(false);

  protected readonly routeTypeLabel = routeTypeLabel;

  protected readonly chosen = computed<ReadonlySet<string>>(() => new Set(this.editor.routeIds()));

  /** Every route in the area, plus chosen routes that are not (any more), sorted as the Transit tab sorts. */
  private readonly candidates = computed<PickableRoute[]>(() => {
    const inArea = this.editor.routeIdsInArea();
    const savedById = new Map(this.editor.savedRoutes().map(route => [route.routeId, route] as const));
    const ids = new Set([...inArea, ...this.chosen()]);
    const routes: PickableRoute[] = [];

    for (const routeId of ids) {
      const route = this.catalog.route(routeId);
      const saved = savedById.get(routeId);
      if (!route && !saved) continue;
      const agencyName = route?.agencyName ?? saved?.agencyName;
      const name = route ? route.routeShortName || route.routeLongName || routeId : saved?.routeShortName || routeId;
      const routeType = route?.routeType ?? saved?.routeType;
      const label = agencyName ? `${agencyName} - ${name}` : name;
      routes.push({
        routeId,
        label,
        routeType,
        available: route !== undefined,
        inArea: inArea.has(routeId),
        note: route === undefined ? 'no longer in the timetable' : inArea.has(routeId) ? undefined : 'outside the area',
        searchText: normalizeSearchText([label, route?.routeLongName, routeId, routeTypeLabel(routeType)]
          .filter(isNonEmptyString).join(' '))
      });
    }
    return routes.sort((first, second) => compareText(first.label, second.label) || compareText(first.routeId, second.routeId));
  });

  /** The chosen routes, for a template only shown here. */
  protected readonly chosenRoutes = computed(() => this.candidates().filter(route => this.chosen().has(route.routeId)));

  protected readonly routeTypes = computed(() =>
    [...new Set(this.candidates().map(route => route.routeType).filter(isNonEmptyString))].sort(compareText));

  protected readonly shown = computed(() => {
    const search = normalizeSearchText(this.search());
    const routeType = this.routeType();
    const chosen = this.chosen();
    return this.candidates().filter(route =>
      (!search || route.searchText.includes(search))
      && (!routeType || route.routeType === routeType)
      && (!this.chosenOnly() || chosen.has(route.routeId)));
  });

  protected toggle(routeId: string, checked: boolean): void {
    const routeIds = this.editor.routeIds();
    this.editor.setRouteIds(checked ? [...routeIds, routeId] : routeIds.filter(id => id !== routeId));
  }

  protected chooseShown(): void {
    this.editor.setRouteIds([...this.editor.routeIds(), ...this.shown().map(route => route.routeId)]);
  }

  protected unchooseShown(): void {
    const shown = new Set(this.shown().map(route => route.routeId));
    this.editor.setRouteIds(this.editor.routeIds().filter(id => !shown.has(id)));
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setRouteType(event: Event): void {
    this.routeType.set((event.target as HTMLSelectElement).value);
  }

  protected setChosenOnly(event: Event): void {
    this.chosenOnly.set((event.target as HTMLInputElement).checked);
  }
}
