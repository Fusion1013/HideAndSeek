import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { isNonEmptyString } from '../shared/guards';
import { RouteCatalogService } from './route-catalog.service';
import { ChecklistRoute, RouteChecklistComponent } from './route-checklist.component';
import { RouteFilterService } from './route-filter.service';
import { routeListLabel, routeTypeLabel } from './route-labels';
import { RouteSelectionService } from './route-selection.service';

/** How many routes the list shows before asking for a search, so it stays quick to draw and read. */
const MAX_LISTED = 200;

/** The Transit tab: find routes and choose which are drawn on the map. */
@Component({
  selector: 'app-transit-panel',
  imports: [RouteChecklistComponent],
  templateUrl: './transit-panel.component.html',
  styleUrl: './transit-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransitPanelComponent {
  protected readonly selection = inject(RouteSelectionService);
  protected readonly catalog = inject(RouteCatalogService);
  protected readonly filters = inject(RouteFilterService);

  protected readonly routeTypeLabel = routeTypeLabel;

  /** Narrows the list to the routes already on the map. */
  protected readonly chosenOnly = signal(false);
  protected readonly chosen = computed<ReadonlySet<string>>(() => new Set(this.selection.selectedRouteIds()));

  /** The routes matching the filters: what "Select shown" selects. */
  protected readonly shown = computed(() => {
    const chosen = this.chosen();
    const routes = this.filters.filteredRoutes().filter(route => isNonEmptyString(route.routeId));
    return this.chosenOnly() ? routes.filter(route => chosen.has(route.routeId!)) : routes;
  });

  protected readonly listed = computed<ChecklistRoute[]>(() => this.shown().slice(0, MAX_LISTED)
    .map(route => ({ routeId: route.routeId!, label: routeListLabel(route) })));

  protected toggle(routeId: string, chosen: boolean): void {
    const routeIds = this.selection.selectedRouteIds();
    this.selection.select(chosen ? [...routeIds, routeId] : routeIds.filter(id => id !== routeId));
  }

  protected selectShown(): void {
    this.selection.select(this.shown().map(route => route.routeId).filter(isNonEmptyString));
  }

  protected selectNone(): void {
    this.selection.select([]);
  }

  protected clearFilters(): void {
    this.filters.clear();
    this.chosenOnly.set(false);
  }

  protected setChosenOnly(event: Event): void {
    this.chosenOnly.set((event.target as HTMLInputElement).checked);
  }

  protected setSearch(event: Event): void {
    this.filters.search.set((event.target as HTMLInputElement).value);
  }

  protected setAgency(event: Event): void {
    this.filters.agency.set((event.target as HTMLSelectElement).value);
  }

  protected setRouteType(event: Event): void {
    this.filters.routeType.set((event.target as HTMLSelectElement).value);
  }
}
