import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import type MapBrowserEvent from 'ol/MapBrowserEvent';

import { NgComponentOutlet } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import type { StopDTO, VehiclePosition } from '../api/generated';
import { ControlsPanelComponent } from '../controls/controls-panel.component';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { ClosestLocationsService } from '../distance/closest-locations.service';
import { StationMeasurementService } from '../layer/station-measurement.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { ModeService } from '../mode/mode.service';
import { ReachabilityRouteService } from '../shape/reachability-route.service';
import { ReachabilityService } from '../shape/reachability.service';
import { StationTimetableService } from '../station/station-timetable.service';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { RouteSelectionService } from '../transit/route-selection.service';
import { isMappableVehicle } from '../vehicle/vehicle-position';
import { VehicleSelectionService } from '../vehicle/vehicle-selection.service';
import { MapOverlayService } from './map-overlay.service';
import { MapService } from './map.service';

/**
 * The map with its controls panel: creates the map and decides what a click on it means. The map stays while
 * the mode changes; the current mode's route fills the panel.
 */
@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [ControlsPanelComponent, NgComponentOutlet, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapComponent {
  private readonly mapService = inject(MapService);
  private readonly vehicleLayer = inject(VehicleLayerService);
  private readonly stationMeasurement = inject(StationMeasurementService);
  private readonly closestLocations = inject(ClosestLocationsService);
  private readonly reachability = inject(ReachabilityService);
  private readonly reachabilityRoutes = inject(ReachabilityRouteService);
  private readonly vehicleSelection = inject(VehicleSelectionService);
  private readonly modeService = inject(ModeService);
  protected readonly controls = inject(ControlsPanelService);
  protected readonly mapOverlay = inject(MapOverlayService);
  protected readonly routeCatalog = inject(RouteCatalogService);
  protected readonly routeSelection = inject(RouteSelectionService);
  protected readonly stationTimetable = inject(StationTimetableService);

  /** The map the click handler is attached to, so it can be detached from that same map. */
  private boundMap: ReturnType<MapService['getMap']> = null;

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');

  /** The map itself could not be created; data services report their own load errors. */
  readonly mapError = signal(false);

  constructor() {
    afterNextRender(() => void this.initializeMap());
    inject(DestroyRef).onDestroy(() => this.boundMap?.un('singleclick', this.handleMapSingleClick));

    // Vehicle labels on the map use the route names from the catalog
    effect(() => this.vehicleLayer.setRouteMetadata(this.routeCatalog.routes()));
  }

  /**
   * In Overview mode, a click on the map selects the stop or vehicle under it (staying on the Measure tab if open), or makes the stop the start of
   * the reachable stations search while one is being picked. Anywhere else it deselects
   * vehicles, or adds a distance point when the Station tab is waiting for one. The other modes handle their
   * own clicks.
   */
  onMapSingleClick(event: MapBrowserEvent): void {
    const map = this.mapService.getMap();
    if (!map || this.modeService.mode() !== 'overview') return;

    const stop = map.forEachFeatureAtPixel(event.pixel, feature =>
      isStopDTO(feature.get('stop')) ? feature : undefined)?.get('stop') as StopDTO | undefined;
    if (stop) {
      if (this.reachability.pickStop(stop)) return;
      this.vehicleSelection.clear();
      this.stationTimetable.select(stop);
      // Choosing the station to measure from keeps the Measure tab open
      this.controls.show(this.controls.activeMenu() === 'measure' ? 'measure' : 'station');
      return;
    }

    const vehicle = map.forEachFeatureAtPixel(event.pixel, feature =>
      isMappableVehicle(feature.get('vehicle')) ? feature : undefined)?.get('vehicle') as VehiclePosition | undefined;
    if (vehicle) {
      this.vehicleSelection.selectOnly(vehicle);
      this.controls.show('vehicles');
      return;
    }

    this.vehicleSelection.clear();
    this.stationTimetable.addMeasurePointAt(event.coordinate);
  }

  private async initializeMap(): Promise<void> {
    try {
      await this.mapService.createMap(this.mapElement().nativeElement);
      const map = this.mapService.getMap();
      if (!map) throw new Error('Map creation did not produce a map instance.');
      this.stationMeasurement.initialize(map);
      this.closestLocations.initialize(map);
      this.reachability.initialize(map);
      this.reachabilityRoutes.initialize(map);
      map.on('singleclick', this.handleMapSingleClick);
      this.boundMap = map;
      void this.vehicleSelection.refresh();
    } catch {
      this.mapError.set(true);
    }
  }

  private readonly handleMapSingleClick = (event: MapBrowserEvent): void => {
    this.onMapSingleClick(event);
  };
}

function isStopDTO(value: unknown): value is StopDTO {
  return typeof value === 'object' && value !== null
    && 'stopId' in value && (typeof value.stopId === 'string' || value.stopId === undefined);
}
