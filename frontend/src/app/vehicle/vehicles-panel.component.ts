import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import type { VehiclePosition } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import { formatClock } from '../shared/format';
import { secondsOfDay } from '../shared/gtfs-time';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { TransitService } from '../transit/transit.service';
import { vehicleKey } from './vehicle-position';
import { VEHICLE_REFRESH_MS } from './vehicle-refresh';
import { VehicleSelectionService } from './vehicle-selection.service';
import { VehicleTripComponent } from './vehicle-trip.component';

/** The Vehicles tab: the live vehicle list, and the trip of the one selected. */
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

  protected readonly vehicleKey = vehicleKey;
  protected readonly refreshSeconds = VEHICLE_REFRESH_MS / 1000;

  protected readonly updatedAt = computed(() => {
    const updatedAt = this.transit.vehiclePositionsUpdatedAt();
    return updatedAt === null ? null : formatClock(secondsOfDay(updatedAt), true);
  });

  protected readonly autoRefresh = computed(() => this.layers.visibleLayerIds().has('vehicles'));

  protected setAutoRefresh(on: boolean): void {
    this.layers.setLayerVisibility('vehicles', on);
  }

  protected optionLabel(vehicle: VehiclePosition, index: number): string {
    const route = this.catalog.route(vehicle.routeId);
    const routeName = route?.routeShortName || vehicle.routeId || 'Unknown route';
    const agency = route?.agencyName || 'Agency unknown';
    return `${routeName} · ${agency} · ${vehicle.id || vehicle.tripId || `Position ${index + 1}`}`;
  }

  protected onSelectionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selection.select(Array.from(select.selectedOptions, option => option.value));
  }
}
