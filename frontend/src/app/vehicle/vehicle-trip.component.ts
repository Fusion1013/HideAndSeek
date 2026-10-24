import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { LucideBusFront } from '@lucide/angular';

import type { AgencyRouteDTO, VehiclePosition } from '../api/generated';
import { routeColor } from '../layer/route-shapes-layer.service';
import { StopsLayerService } from '../layer/stops-layer.service';
import { MapService } from '../map/map.service';
import { formatApproximateDistance, formatClock } from '../shared/format';
import { parseGtfsTime, secondsOfDay } from '../shared/gtfs-time';
import { locateVehicle, serviceDaySeconds } from './trip-progress';
import type { LonLat, TripStop } from './trip-progress';
import type { VehicleTripData } from './vehicle-trip.service';

type StopStatus = 'passed' | 'current' | 'next' | 'upcoming';

interface StopRow {
  stop: TripStop;
  status: StopStatus;
  time: string;
  isTerminus: boolean;
}

/**
 * A vehicle's trip: route, destination, every stop in order, and where along the route it is. Shows the
 * trip it is given; loading it is up to the caller, so the same data can also draw the route on the map.
 */
@Component({
  selector: 'app-vehicle-trip',
  templateUrl: './vehicle-trip.component.html',
  styleUrl: './vehicle-trip.component.scss',
  imports: [LucideBusFront],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--route-color]': 'color()'
  }
})
export class VehicleTripComponent {
  readonly vehicle = input.required<VehiclePosition>();
  readonly route = input<AgencyRouteDTO | undefined>();
  readonly trip = input<VehicleTripData | undefined>();
  readonly tripLoading = input(false);
  readonly tripError = input(false);

  private readonly stopsLayer = inject(StopsLayerService);
  private readonly mapService = inject(MapService);

  /** Refreshed periodically so "in 3 min" stays current between vehicle updates. */
  private readonly now = signal(Date.now());

  protected readonly stops = computed<TripStop[]>(() => {
    const stopsById = this.stopsLayer.stopsById();
    return (this.trip()?.stopTimes ?? []).flatMap(stopTime => {
      const stop = stopsById.get(stopTime.stopId ?? '');
      if (typeof stop?.longitude !== 'number' || typeof stop.latitude !== 'number') return [];
      return [{
        stopId: stop.stopId ?? '',
        name: stop.stopName || stop.stopId || 'Unnamed stop',
        platform: stop.platformCode || undefined,
        longitude: stop.longitude,
        latitude: stop.latitude,
        arrivalSeconds: parseGtfsTime(stopTime.arrivalTime),
        departureSeconds: parseGtfsTime(stopTime.departureTime)
      }];
    });
  });

  private readonly path = computed<LonLat[] | null>(() => {
    const shape = this.trip()?.shape ?? [];
    const points = shape
      .filter(point => typeof point.shapePtLon === 'number' && typeof point.shapePtLat === 'number')
      .map(point => [point.shapePtLon!, point.shapePtLat!] as const);
    return points.length >= 2 ? points : null;
  });

  private readonly nowSeconds = computed(() => serviceDaySeconds(this.now(), this.stops()));

  protected readonly progress = computed(() => {
    const { longitude, latitude } = this.vehicle();
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
    return locateVehicle(this.stops(), this.path(), [longitude, latitude], this.nowSeconds());
  });

  /** The stop the vehicle is heading for, or the one it is at. */
  protected readonly targetIndex = computed(() => {
    const progress = this.progress();
    if (!progress) return null;
    if (progress.atStopIndex !== null) return progress.atStopIndex;
    const next = progress.previousIndex + 1;
    return next < this.stops().length ? next : null;
  });

  protected readonly rows = computed<StopRow[]>(() => {
    const progress = this.progress();
    const stops = this.stops();
    return stops.map((stop, index) => ({
      stop,
      time: formatClock(stop.departureSeconds ?? stop.arrivalSeconds),
      isTerminus: index === 0 || index === stops.length - 1,
      status: !progress ? 'upcoming'
        : index === progress.atStopIndex ? 'current'
        : index === this.targetIndex() ? 'next'
        : index <= progress.previousIndex ? 'passed'
        : 'upcoming'
    }));
  });

  /** Where to draw the moving bus: on the stretch after `index`, `fraction` of the way to the next stop. */
  protected readonly marker = computed(() => {
    const progress = this.progress();
    if (!progress || progress.atStopIndex !== null) return null;
    if (progress.previousIndex < 0) return { index: 0, fraction: 0 };
    if (progress.previousIndex >= this.stops().length - 1) return { index: this.stops().length - 1, fraction: 0 };
    return { index: progress.previousIndex, fraction: progress.fraction };
  });

  protected readonly color = computed(() => routeColor(this.vehicle().routeId ?? ''));

  protected readonly routeName = computed(() =>
    this.route()?.routeShortName || this.trip()?.trip?.tripShortName || this.vehicle().routeId || 'Unknown route');

  protected readonly routeDescription = computed(() =>
    [this.route()?.agencyName, this.route()?.routeLongName].filter(Boolean).join(' · '));

  protected readonly headsign = computed(() =>
    this.trip()?.trip?.tripHeadsign || this.stops().at(-1)?.name);

  protected readonly speed = computed(() => {
    const speed = this.vehicle().speedMetersPerSecond;
    return typeof speed === 'number' ? `${Math.round(speed * 3.6)} km/h` : null;
  });

  protected readonly updatedAt = computed(() => {
    const timestamp = this.vehicle().timestamp;
    return timestamp ? formatClock(secondsOfDay(Date.parse(timestamp)), true) : null;
  });

  protected readonly nextStop = computed(() => {
    const index = this.targetIndex();
    const progress = this.progress();
    if (index === null || !progress) return null;
    const stop = this.stops()[index];
    const scheduled = stop.arrivalSeconds ?? stop.departureSeconds;
    const minutes = scheduled === undefined ? null : Math.round((scheduled - this.nowSeconds()) / 60);
    return {
      stop,
      isHere: progress.atStopIndex === index,
      time: formatClock(scheduled),
      due: minutes === null ? null : minutes <= 0 ? 'due now' : `in ${minutes} min`,
      distance: progress.atStopIndex === index || progress.metersToNextStop === null
        ? null
        : formatApproximateDistance(progress.metersToNextStop)
    };
  });

  protected readonly tripPercent = computed(() => Math.round((this.progress()?.tripFraction ?? 0) * 100));

  protected readonly progressText = computed(() => {
    const next = this.nextStop();
    const index = this.targetIndex();
    if (!next || index === null) return `Trip ${this.tripPercent()}% complete`;
    const where = next.isHere ? `At ${next.stop.name}` : `Heading for ${next.stop.name}`;
    return `${where}, ${this.tripPercent()}% of the trip, stop ${index + 1} of ${this.stops().length}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected focusStop(stop: TripStop): void {
    this.mapService.focusOnCoordinates(stop.longitude, stop.latitude);
  }

  protected statusLabel(status: StopStatus): string {
    switch (status) {
      case 'passed': return 'Passed';
      case 'current': return 'Vehicle is here';
      case 'next': return 'Next stop';
      case 'upcoming': return 'Upcoming';
    }
  }
}
