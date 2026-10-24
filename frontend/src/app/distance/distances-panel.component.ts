import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { MAP_LAYERS } from '../layer/map-layers';
import type { MapLayerId } from '../layer/map-layers';
import type { GeolocationError } from '../position/geolocation.service';
import { formatDistance } from '../shared/format';
import { ClosestLocationsService } from './closest-locations.service';
import type { PositionSource } from './closest-locations.service';

/** The Distances tab: the closest place on each open layer to the mouse or the GPS position. */
@Component({
  selector: 'app-distances-panel',
  templateUrl: './distances-panel.component.html',
  styleUrl: './distances-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DistancesPanelComponent {
  protected readonly closest = inject(ClosestLocationsService);
  private readonly controls = inject(ControlsPanelService);

  protected readonly formatDistance = formatDistance;
  protected readonly layerLabels: ReadonlyMap<MapLayerId, string> = new Map(MAP_LAYERS.map(layer => [layer.id, layer.label]));

  constructor() {
    // Distances are only calculated and drawn while this tab is showing in an open panel
    effect(() => this.closest.active.set(this.controls.open()));
    inject(DestroyRef).onDestroy(() => this.closest.active.set(false));
  }

  protected setPositionSource(event: Event): void {
    this.closest.positionSource.set((event.target as HTMLSelectElement).value as PositionSource);
  }

  protected gpsErrorMessage(error: GeolocationError): string {
    switch (error) {
      case 'unsupported': return 'This browser cannot provide a GPS position.';
      case 'permission-denied': return 'Location access was denied. Allow it in the browser to use GPS.';
      case 'timeout': return 'Getting a GPS position took too long. Still trying...';
      case 'unavailable': return 'Your position is currently unavailable. Still trying...';
    }
  }
}
