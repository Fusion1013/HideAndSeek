import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AgencyRouteControllerService } from '../api/generated';
import type { AgencyRouteDTO } from '../api/generated';
import { isNonEmptyString } from '../shared/guards';
import { compareRoutes, compareText } from './route-labels';

/** Every route with its agency, loaded once and shared by everything that names or lists routes. */
@Injectable({ providedIn: 'root' })
export class RouteCatalogService {
  private readonly agencyRouteApi = inject(AgencyRouteControllerService);

  private readonly catalog = rxResource({
    stream: () => this.agencyRouteApi.getAgencyRoutes()
  });

  /** All routes, sorted as they are listed. Empty until loaded, and if loading failed. */
  readonly routes = computed<AgencyRouteDTO[]>(() =>
    // value() throws while the resource is in its error state
    this.catalog.hasValue() ? [...this.catalog.value()].sort(compareRoutes) : []);

  readonly routesById = computed(() => new Map(this.routes()
    .filter(route => isNonEmptyString(route.routeId))
    .map(route => [route.routeId!, route] as const)));

  readonly agencies = computed(() => [...new Set(this.routes()
    .map(route => route.agencyName)
    .filter(isNonEmptyString))].sort(compareText));

  /** GTFS route_type values in use. */
  readonly routeTypes = computed(() => [...new Set(this.routes()
    .map(route => route.routeType)
    .filter(isNonEmptyString))].sort(compareText));

  readonly loadError = computed(() => this.catalog.error() !== undefined);

  route(routeId: string | undefined): AgencyRouteDTO | undefined {
    return routeId ? this.routesById().get(routeId) : undefined;
  }
}
