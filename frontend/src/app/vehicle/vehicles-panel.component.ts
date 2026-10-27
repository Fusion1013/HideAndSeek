import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import type { VehiclePosition } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import { formatClock } from '../shared/format';
import { secondsOfDay } from '../shared/gtfs-time';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { normalizeSearchText } from '../transit/route-labels';
import { RouteSelectionService } from '../transit/route-selection.service';
import { TransitService } from '../transit/transit.service';
import { vehicleKey } from './vehicle-position';
import { VEHICLE_REFRESH_MS } from './vehicle-refresh';
import { VehicleSelectionService } from './vehicle-selection.service';
import { VehicleTripComponent } from './vehicle-trip.component';

/** How many vehicles the list shows before asking for a search. */
const MAX_LISTED = 100;

/** The Vehicles tab: the live vehicle list, to search and narrow to the routes shown, and the trip of the one selected. */
@Component({
  selector: 'app-vehicles-panel',
  templateUrl: './vehicles-panel.component.html',
  styleUrl: './vehicles-panel.component.scss',
  imports: [VehicleTripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VehiclesPanelComponent {
  protected readonly selection = inject(VehicleSelectionService);
  protected readonly transit = inject(TransitService);
  protected readonly catalog = inject(RouteCatalogService);
  private readonly layers = inject(LayerService);
  private readonly routeSelection = inject(RouteSelectionService);

  protected readonly vehicleKey = vehicleKey;
  protected readonly refreshSeconds = VEHICLE_REFRESH_MS / 1000;

  protected readonly updatedAt = computed(() => {
    const updatedAt = this.transit.vehiclePositionsUpdatedAt();
    return updatedAt === null ? null : formatClock(secondsOfDay(updatedAt), true);
  });

  protected readonly autoRefresh = computed(() => this.layers.visibleLayerIds().has('vehicles'));

  protected readonly search = signal('');
  /** Narrows the list to vehicles on the routes chosen in the Routes tab. */
  protected readonly onShownRoutes = signal(false);
  protected readonly shownRouteIds = computed<ReadonlySet<string>>(() => new Set(this.routeSelection.selectedRouteIds()));
  protected readonly selected = computed<ReadonlySet<string>>(() => new Set(this.selection.selectedIds()));

  protected readonly shown = computed(() => {
    const search = normalizeSearchText(this.search());
    const routeIds = this.onShownRoutes() && this.shownRouteIds().size > 0 ? this.shownRouteIds() : null;
    return this.selection.vehicles().filter((vehicle, index) =>
      (!routeIds || routeIds.has(vehicle.routeId ?? ''))
      && (!search || normalizeSearchText(this.optionLabel(vehicle, index)).includes(search)));
  });
  protected readonly listed = computed(() => this.shown().slice(0, MAX_LISTED));

  protected setAutoRefresh(on: boolean): void {
    this.layers.setLayerVisibility('vehicles', on);
  }

  protected optionLabel(vehicle: VehiclePosition, index: number): string {
    const route = this.catalog.route(vehicle.routeId);
    const routeName = route?.routeShortName || vehicle.routeId || 'Unknown route';
    const agency = route?.agencyName || 'Agency unknown';
    return `${routeName} · ${agency} · ${vehicle.id || vehicle.tripId || `Position ${index + 1}`}`;
  }

  protected toggle(vehicle: VehiclePosition, event: Event): void {
    const key = vehicleKey(vehicle);
    const ids = this.selection.selectedIds();
    this.selection.select((event.target as HTMLInputElement).checked ? [...ids, key] : ids.filter(id => id !== key));
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setOnShownRoutes(event: Event): void {
    this.onShownRoutes.set((event.target as HTMLInputElement).checked);
  }
}
