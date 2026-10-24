import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { isNonEmptyString } from '../shared/guards';
import { RouteCatalogService } from './route-catalog.service';
import { RouteFilterService } from './route-filter.service';
import { routeListLabel, routeTypeLabel } from './route-labels';
import { RouteSelectionService } from './route-selection.service';

/** The Transit tab: find routes and choose which are drawn on the map. */
@Component({
  selector: 'app-transit-panel',
  templateUrl: './transit-panel.component.html',
  styleUrl: './transit-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransitPanelComponent {
  protected readonly selection = inject(RouteSelectionService);
  protected readonly catalog = inject(RouteCatalogService);
  protected readonly filters = inject(RouteFilterService);

  protected readonly routeTypeLabel = routeTypeLabel;
  protected readonly routeListLabel = routeListLabel;

  protected onRoutesChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selection.select(Array.from(select.selectedOptions, option => option.value));
  }

  protected selectShown(): void {
    this.selection.select(this.filters.filteredRoutes().map(route => route.routeId).filter(isNonEmptyString));
  }

  protected selectNone(): void {
    this.selection.select([]);
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
