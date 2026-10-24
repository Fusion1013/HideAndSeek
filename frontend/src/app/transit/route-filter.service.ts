import { computed, inject, Injectable, signal } from '@angular/core';

import { isNonEmptyString } from '../shared/guards';
import { RouteCatalogService } from './route-catalog.service';
import { normalizeSearchText, routeTypeLabel } from './route-labels';

/** The route list's search and filters. Kept outside the tab so they survive switching tabs. */
@Injectable({ providedIn: 'root' })
export class RouteFilterService {
  private readonly catalog = inject(RouteCatalogService);

  readonly search = signal('');
  /** Agency name, or '' for all. */
  readonly agency = signal('');
  /** GTFS route_type, or '' for all. */
  readonly routeType = signal('');

  readonly activeFilterCount = computed(() =>
    Number(this.search().trim().length > 0) + Number(this.agency().length > 0) + Number(this.routeType().length > 0));

  readonly filteredRoutes = computed(() => {
    const search = normalizeSearchText(this.search());
    const agency = this.agency();
    const routeType = this.routeType();

    return this.catalog.routes().filter(route => {
      const searchText = normalizeSearchText([
        route.agencyName,
        route.routeShortName,
        route.routeLongName,
        route.routeId,
        routeTypeLabel(route.routeType)
      ].filter(isNonEmptyString).join(' '));
      return (!search || searchText.includes(search))
        && (!agency || route.agencyName === agency)
        && (!routeType || route.routeType === routeType);
    });
  });

  clear(): void {
    this.search.set('');
    this.agency.set('');
    this.routeType.set('');
  }
}
