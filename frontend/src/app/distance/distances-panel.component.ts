import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

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
  protected readonly controls = inject(ControlsPanelService);

  protected readonly formatDistance = formatDistance;
  protected readonly layerLabels: ReadonlyMap<MapLayerId, string> = new Map(MAP_LAYERS.map(layer => [layer.id, layer.label]));

  protected waitingText(): string {
    switch (this.closest.positionSource()) {
      case 'gps': return 'Waiting for a GPS position...';
      case 'center': return 'Waiting for the map...';
      case 'mouse': return 'Move the mouse over the map.';
    }
  }

  protected setPositionSource(event: Event): void {
    this.closest.positionSource.set((event.target as HTMLSelectElement).value as PositionSource);
  }

  /** A circle around each closest place, through the position. */
  protected setShowCircles(event: Event): void {
    this.closest.showCircles.set((event.target as HTMLInputElement).checked);
  }

  protected gpsErrorMessage(error: GeolocationError): string {
    switch (error) {
      case 'unsupported': return 'This browser cannot provide a GPS position.';
      case 'insecure-context': return 'GPS needs a secure connection. Open this site with https:// to use it.';
      case 'permission-denied': return 'Location access was denied. Allow it in the browser to use GPS.';
      case 'timeout': return 'Getting a GPS position took too long. Still trying...';
      case 'unavailable': return 'Your position is currently unavailable. Still trying...';
    }
  }
}
