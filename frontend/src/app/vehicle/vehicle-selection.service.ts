import { computed, effect, inject, Injectable, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';

import type { VehiclePosition } from '../api/generated';
import { TripControllerService } from '../api/generated';
import { LayerService } from '../layer/layer.service';
import { RouteShapesLayerService } from '../layer/route-shapes-layer.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { MapService } from '../map/map.service';
import { isNonEmptyString, sameItems } from '../shared/guards';
import { TransitService } from '../transit/transit.service';
import { isMappableVehicle, vehicleKey } from './vehicle-position';
import { VEHICLE_REFRESH_MS } from './vehicle-refresh';
import { VehicleTripService } from './vehicle-trip.service';

const NO_ROUTES: ReadonlyMap<string, string> = new Map();

/**
 * Which vehicles are selected, which one is followed (its trip is loaded and its route drawn on the map),
 * and keeping positions fresh while vehicles are on the map.
 */
@Injectable({ providedIn: 'root' })
export class VehicleSelectionService {
  private readonly transit = inject(TransitService);
  private readonly tripApi = inject(TripControllerService);
  private readonly tripService = inject(VehicleTripService);
  private readonly mapService = inject(MapService);
  private readonly layerService = inject(LayerService);
  private readonly vehicleLayer = inject(VehicleLayerService);
  private readonly routeShapesLayer = inject(RouteShapesLayerService);

  /** Selected vehicles, by {@link vehicleKey}. */
  readonly selectedIds = signal<string[]>([]);
  /** The vehicle whose trip is shown: the one selected last, while it is still selected. */
  private readonly followedKey = signal<string | null>(null);

  /** Trip ids of vehicles whose position does not say which route they are on. Equal lists do not refetch. */
  private readonly unresolvedTripIds = computed(
    () => [...new Set(this.transit.vehiclePositions()
      .filter(position => !isNonEmptyString(position.routeId) && isNonEmptyString(position.tripId))
      .map(position => position.tripId!))].sort(),
    { equal: sameItems }
  );

  private readonly tripRoutes = rxResource({
    params: this.unresolvedTripIds,
    stream: ({ params: tripIds }) => tripIds.length === 0
      ? of(new Map<string, string>())
      : this.tripApi.getTripsByTripIds(tripIds).pipe(map(trips => new Map(trips
        .filter(trip => isNonEmptyString(trip.tripId) && isNonEmptyString(trip.routeId))
        .map(trip => [trip.tripId!, trip.routeId!] as const))))
  });

  /**
   * Route of each trip, for vehicles whose position only names their trip. Keeps the previous lookup while
   * a new one loads, so labels and list order do not flicker every time a vehicle starts a trip; empty if the
   * lookup failed.
   */
  private readonly routeIdsByTripId = linkedSignal<ReadonlyMap<string, string> | null, ReadonlyMap<string, string>>({
    source: () => this.tripRoutes.hasValue() ? this.tripRoutes.value() : this.tripRoutes.error() ? NO_ROUTES : null,
    computation: (routes, previous) => routes ?? previous?.value ?? NO_ROUTES
  });

  /** Vehicles that can be drawn, with their route filled in, in list order. */
  readonly vehicles = computed(() => {
    const routeIdsByTripId = this.routeIdsByTripId();
    return this.transit.vehiclePositions().filter(isMappableVehicle).map(vehicle => {
      const routeId = vehicle.routeId || routeIdsByTripId.get(vehicle.tripId ?? '');
      return routeId && routeId !== vehicle.routeId ? { ...vehicle, routeId } : vehicle;
    }).sort((left, right) => {
      const leftLabel = left.routeId || left.tripId || '';
      if (leftLabel === '') return 1;
      const rightLabel = right.routeId || right.tripId || '';
      if (rightLabel === '') return -1;
      return leftLabel.localeCompare(rightLabel);
    });
  });

  readonly selectedVehicles = computed(() => {
    const selected = new Set(this.selectedIds());
    return this.vehicles().filter(vehicle => selected.has(vehicleKey(vehicle)));
  });

  readonly followedVehicle = computed(() => {
    const selected = this.selectedVehicles();
    return selected.find(vehicle => vehicleKey(vehicle) === this.followedKey()) ?? selected[0] ?? null;
  });

  /** A computed, so a new position object for the same trip (every update) does not reload the trip. */
  private readonly followedTripId = computed(() => this.followedVehicle()?.tripId || undefined);

  /** The followed vehicle's trip, loaded once for both the route on the map and the trip panel. */
  private readonly tripResource = rxResource({
    params: this.followedTripId,
    stream: ({ params: tripId }) => this.tripService.load(tripId)
  });

  readonly trip = computed(() => this.tripResource.hasValue() ? this.tripResource.value() : undefined);
  readonly tripLoading = this.tripResource.isLoading;
  readonly tripError = computed(() => this.tripResource.error() !== undefined);

  constructor() {
    // The followed vehicle's route, dotted on the map; redrawn when it starts another trip
    effect(() => {
      const shape = this.trip()?.shape ?? [];
      this.routeShapesLayer.setVehicleRouteShape(shape.length > 0 ? shape : null);
    });

    effect(() => this.vehicleLayer.setTripRouteIds(this.routeIdsByTripId()));

    // Keep positions fresh while vehicles are shown on the map
    effect(onCleanup => {
      if (!this.layerService.visibleLayerIds().has('vehicles')) return;
      untracked(() => this.refreshIfStale());
      const timer = setInterval(() => this.refreshIfStale(), VEHICLE_REFRESH_MS);
      const onVisibilityChange = () => this.refreshIfStale();
      document.addEventListener('visibilitychange', onVisibilityChange);
      onCleanup(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      });
    });
  }

  /** Selection from the vehicle list: follows and centres the vehicle just added. */
  select(ids: string[]): void {
    const added = ids.find(id => !this.selectedIds().includes(id)) ?? ids.at(-1);
    this.selectedIds.set(ids);
    this.follow(this.vehicles().find(vehicle => vehicleKey(vehicle) === added));
  }

  /** A vehicle clicked on the map becomes the only one selected. */
  selectOnly(vehicle: VehiclePosition): void {
    this.selectedIds.set([vehicleKey(vehicle)]);
    this.follow(vehicle);
  }

  /** Deselects every vehicle, which also removes the route from the map. */
  clear(): void {
    this.selectedIds.set([]);
    this.followedKey.set(null);
  }

  /** Fetches new positions; vehicles that left the feed are deselected. */
  async refresh(): Promise<void> {
    const map = this.mapService.getMap();
    if (!map) return;
    try {
      await this.vehicleLayer.refreshVehiclePositions(map);
    } catch {
      return;   // the transit service reports the error
    }
    const available = new Set(this.vehicles().map(vehicleKey));
    this.selectedIds.update(ids => ids.filter(id => available.has(id)));
  }

  private follow(vehicle: VehiclePosition | undefined): void {
    if (!vehicle) {
      if (this.selectedIds().length === 0) this.clear();
      return;
    }
    this.followedKey.set(vehicleKey(vehicle));
    if (isMappableVehicle(vehicle)) this.mapService.focusOnCoordinates(vehicle.longitude!, vehicle.latitude!);
  }

  /** Refreshes positions when they are older than the refresh interval and the page is in view. */
  private refreshIfStale(): void {
    if (document.hidden || this.transit.vehiclePositionsLoading()) return;
    const updatedAt = this.transit.vehiclePositionsUpdatedAt();
    // A little slack so the timer is not skipped by a fetch that finished a moment late
    if (updatedAt !== null && Date.now() - updatedAt < VEHICLE_REFRESH_MS - 2000) return;
    void this.refresh();
  }
}
