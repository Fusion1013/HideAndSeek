import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { LucideBusFront, LucideLayers, LucideMapPin, LucidePanelRightClose, LucidePanelRightOpen, LucideRoute, LucideRuler } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { transformExtent } from 'ol/proj';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import type Feature from 'ol/Feature';
import { MapService } from './map.service';
import { LayerService } from '../layer/layer.service';
import type { MapLayerId } from '../layer/layer.service';
import { ShapeService } from '../shape/shape.service';
import { StationMeasurementService } from '../layer/station-measurement.service';
import { TransitService as TransitDataService } from '../transit/transit.service';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { AgencyRouteControllerService, ShapeControllerService, StopControllerService, StopTimeControllerService, TripControllerService } from '../api/generated';
import type { AgencyRouteEntity, ShapeEntity, StopEntity } from '../api/generated';
import type { StationMeasurePoint } from '../layer/station-measurement.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [LucideBusFront, LucideLayers, LucideMapPin, LucidePanelRightClose, LucidePanelRightOpen, LucideRoute, LucideRuler],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapComponent implements OnInit, OnDestroy {

  private readonly mapService = inject(MapService);
  private readonly layerService = inject(LayerService);
  private readonly shapeService = inject(ShapeService);
  readonly stationMeasurement = inject(StationMeasurementService);
  private readonly transitService = inject(TransitDataService);
  private readonly agencyRouteService = inject(AgencyRouteControllerService);
  private readonly stopService = inject(StopControllerService);
  private readonly stopTimeService = inject(StopTimeControllerService);
  private readonly tripService = inject(TripControllerService);
  private readonly shapeController = inject(ShapeControllerService);

  private mapReady = false;
  private selectionRequest = 0;
  private stationTimetableRequest = 0;
  private vehicleRouteRequest = 0;
  private vehicleRouteResolutionRequest = 0;
  private stationClockTimer?: ReturnType<typeof setInterval>;
  private boundMap: ReturnType<MapService['getMap']> = null;

  @ViewChild('mapElement', { static: true })
  mapElement!: ElementRef<HTMLDivElement>;

  readonly lines = signal<AgencyRouteEntity[]>([]);
  readonly routesById = computed(() => new Map(this.lines()
    .filter(route => isString(route.routeId))
    .map(route => [route.routeId, route] as const)));
  readonly selectedLines = signal<string[]>([]);
  readonly selectedVehicleIds = signal<string[]>([]);
  readonly routeSearch = signal('');
  readonly selectedAgency = signal('');
  readonly selectedRouteType = signal('');
  readonly loadError = signal(false);
  readonly routeAgencies = computed(() => [...new Set(this.lines()
    .map(route => route.agencyName)
    .filter(isString))].sort(agencyRouteCollator.compare));
  readonly routeTypes = computed(() => [...new Set(this.lines()
    .map(route => route.routeType)
    .filter(isString))].sort((first, second) => agencyRouteCollator.compare(first, second)));
  readonly filteredLines = computed(() => {
    const search = normalizeRouteSearch(this.routeSearch());
    const agency = this.selectedAgency();
    const routeType = this.selectedRouteType();

    return this.lines().filter(route => {
      const searchText = normalizeRouteSearch([
        route.agencyName,
        route.routeShortName,
        route.routeLongName,
        route.routeId,
        getRouteTypeLabel(route.routeType)
      ].filter(isString).join(' '));
      return (!search || searchText.includes(search))
        && (!agency || route.agencyName === agency)
        && (!routeType || route.routeType === routeType);
    });
  });
  readonly activeRouteFilterCount = computed(() =>
    Number(this.routeSearch().trim().length > 0)
    + Number(this.selectedAgency().length > 0)
    + Number(this.selectedRouteType().length > 0)
  );
  readonly mapLayers = [
    { id: 'base-map', label: 'Base map' },
    { id: 'districts', label: 'Districts' },
    { id: 'routes', label: 'Routes' },
    { id: 'stops', label: 'Stops' },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'airports', label: 'Airports' },
    { id: 'aquariums', label: 'Aquariums' },
    { id: 'parks', label: 'Parks' },
    { id: 'rail_station', label: 'Rail Stations' },
    { id: 'mountains', label: 'Mountains' },
    { id: 'admin_division_1', label: 'Admin Division 1' },
    { id: 'admin_division_2', label: 'Admin Division 2' },
    { id: 'admin_division_4', label: 'Admin Division 4' },
  ] as const;
  readonly layerVisibility = signal<Record<MapLayerId, boolean>>({
    'base-map': this.layerService.getLayerVisibility('base-map'),
    districts: this.layerService.getLayerVisibility('districts'),
    routes: this.layerService.getLayerVisibility('routes'),
    stops: this.layerService.getLayerVisibility('stops'),
    vehicles: this.layerService.getLayerVisibility('vehicles'),
    measurements: this.layerService.getLayerVisibility('measurements'),
    airports: this.layerService.getLayerVisibility('airports'),
    aquariums: this.layerService.getLayerVisibility('aquariums'),
    parks: this.layerService.getLayerVisibility('parks'),
    rail_station: this.layerService.getLayerVisibility('rail_station'),
    mountains: this.layerService.getLayerVisibility('mountains'),
    admin_division_1: this.layerService.getLayerVisibility('admin_division_1'),
    admin_division_2: this.layerService.getLayerVisibility('admin_division_2'),
    admin_division_4: this.layerService.getLayerVisibility('admin_division_4'),
  });

  readonly drawMode = signal<'line' | 'circle' | null>(null);
  readonly controlsOpen = signal(false);
  readonly activeControlsMenu = signal<'transit' | 'vehicles' | 'station' | 'measure' | 'layers'>('transit');
  readonly addingStationMeasurePoint = signal(false);
  readonly stationStopTimes = signal<StationStopTimeRow[]>([]);
  readonly stationStopTimesLoading = signal(false);
  readonly stationStopTimesError = signal(false);
  readonly stationRouteIds = signal<string[]>([]);
  readonly stationClock = signal(Date.now());
  readonly stationTimetableRows = computed(() => buildStationTimetableRows(
    this.stationStopTimes(),
    localTimeSeconds(this.stationClock())
  ));

  @ViewChild('stationTimetableViewport')
  set stationTimetableViewport(element: ElementRef<HTMLDivElement> | undefined) {
    if (element) queueMicrotask(() => this.centerStationTimetable(element.nativeElement));
  }
  readonly shapeCount = this.shapeService.shapeCount;
  readonly selectedShapeCount = this.shapeService.selectedShapeCount;
  readonly vehiclePositions = this.transitService.vehiclePositions;
  readonly vehicleRouteIdsByTripId = signal<ReadonlyMap<string, string>>(new Map());
  readonly vehiclePositionsLoading = this.transitService.vehiclePositionsLoading;
  readonly vehiclePositionsError = this.transitService.vehiclePositionsError;
  readonly mappableVehicles = computed(() => {
    const positions: unknown = this.vehiclePositions();
    if (!Array.isArray(positions)) return [];

    const routeIdsByTripId = this.vehicleRouteIdsByTripId();
    return positions.filter(isMappableVehicle).map(vehicle => {
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
    const selectedIds = new Set(this.selectedVehicleIds());
    return this.mappableVehicles().filter(vehicle => selectedIds.has(getVehicleSelectionKey(vehicle)));
  });

  ngOnInit(): void {
    void this.initializeMap();
    this.stationClockTimer = setInterval(() => this.stationClock.set(Date.now()), 30000);
    this.agencyRouteService.getAgencyRoutes().subscribe({
      next: routes => {
        this.lines.set([...routes].sort(compareAgencyRoutes));
        this.layerService.setVehicleRouteMetadata(routes);
      },
      error: () => this.loadError.set(true)
    });
  }

  ngOnDestroy(): void {
    this.boundMap?.un('singleclick', this.handleMapSingleClick);
    if (this.stationClockTimer) clearInterval(this.stationClockTimer);
  }

  onMapSingleClick(event: MapBrowserEvent): void {
    const map = this.mapService.getMap();
    if (!map) return;

    const stopFeature = map.forEachFeatureAtPixel(event.pixel, feature => {
      return isStopEntity(feature.get('stop')) ? feature : undefined;
    });
    const stop = stopFeature?.get('stop');
    if (isStopEntity(stop)) {
      this.stationMeasurement.selectStop(stop);
      this.stationRouteIds.set([]);
      this.layerService.setHighlightedVehicleRouteIds([]);
      void this.loadStationStopTimes(stop);
      this.addingStationMeasurePoint.set(false);
      this.controlsOpen.set(true);
      this.activeControlsMenu.set('station');
      return;
    }

    const vehicleFeature = map.forEachFeatureAtPixel(event.pixel, feature =>
      isMappableVehicle(feature.get('vehicle')) ? feature : undefined
    );
    const vehicle = vehicleFeature?.get('vehicle');
    if (isMappableVehicle(vehicle)) {
      this.controlsOpen.set(true);
      this.activeControlsMenu.set('vehicles');
      this.selectedVehicleIds.set([getVehicleSelectionKey(vehicle)]);
      this.focusVehicle(vehicle);
      return;
    }

    if (this.addingStationMeasurePoint() && this.stationMeasurement.selectedStop()) {
      if (this.stationMeasurement.addMeasurePoint(event.coordinate)) {
        this.addingStationMeasurePoint.set(false);
      }
    }
  }

  setStationRadius(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.stationMeasurement.setRadiusMeters(input.valueAsNumber)) {
      input.value = String(this.stationMeasurement.radiusMeters());
    }
  }

  beginStationMeasurePoint(): void {
    this.controlsOpen.set(true);
    this.activeControlsMenu.set('station');
    this.addingStationMeasurePoint.set(true);
  }

  cancelStationMeasurePoint(): void {
    this.addingStationMeasurePoint.set(false);
  }

  removeStationMeasurePoint(point: StationMeasurePoint): void {
    this.stationMeasurement.removeMeasurePoint(point.id);
  }

  formatStationDistance(distance: number): string {
    return distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`;
  }

  clearSelectedStation(): void {
    this.stationTimetableRequest++;
    this.stationStopTimes.set([]);
    this.stationStopTimesLoading.set(false);
    this.stationStopTimesError.set(false);
    this.stationMeasurement.clearSelectedStop();
    this.stationRouteIds.set([]);
    this.layerService.setHighlightedVehicleRouteIds([]);
    this.addingStationMeasurePoint.set(false);
    this.activeControlsMenu.set('transit');
  }

  onLinesChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.setSelectedLines(Array.from(select.selectedOptions, option => option.value));
  }

  selectAllLines(): void {
    this.setSelectedLines(this.filteredLines().map(route => route.routeId).filter(isString));
  }

  setRouteSearch(event: Event): void {
    this.routeSearch.set((event.target as HTMLInputElement).value);
  }

  setSelectedAgency(event: Event): void {
    this.selectedAgency.set((event.target as HTMLSelectElement).value);
  }

  setSelectedRouteType(event: Event): void {
    this.selectedRouteType.set((event.target as HTMLSelectElement).value);
  }

  clearRouteFilters(): void {
    this.routeSearch.set('');
    this.selectedAgency.set('');
    this.selectedRouteType.set('');
  }

  routeTypeLabel(routeType: string): string {
    return getRouteTypeLabel(routeType);
  }

  async selectRoutesInView(): Promise<void> {
    const map = this.mapService.getMap();
    const size = map?.getSize();
    if (!map || !size) return;

    this.loadError.set(false);
    const view = map.getView();
    const [minLongitude, minLatitude, maxLongitude, maxLatitude] = transformExtent(
      view.calculateExtent(size),
      view.getProjection(),
      'EPSG:4326'
    );

    try {
      const stops = await firstValueFrom(this.stopService.getStopsWithinBounds(
        minLatitude,
        maxLatitude,
        minLongitude,
        maxLongitude
      ));
      const stopIds = [...new Set(stops
        .map(stop => stop.stopId)
        .filter(isString))];
      const stopTimes = stopIds.length > 0
        ? await firstValueFrom(this.stopTimeService.getStopTimesByStopIds(stopIds))
        : [];
      const tripIds = [...new Set(stopTimes
        .map(stopTime => stopTime.tripId)
        .filter(isString))];
      const trips = tripIds.length > 0
        ? await firstValueFrom(this.tripService.getTripsByTripIds(tripIds))
        : [];
      const routeIds = trips
        .map(trip => trip.routeId)
        .filter(isString);

      this.setSelectedLines(routeIds);
    } catch {
      this.loadError.set(true);
    }
  }

  clearSelectedLines(): void {
    this.setSelectedLines([]);
  }

  toggleControls(): void {
    this.controlsOpen.update(open => !open);
  }

  showControlsMenu(menu: 'transit' | 'vehicles' | 'station' | 'measure' | 'layers'): void {
    this.activeControlsMenu.set(menu);
  }

  setLayerVisibility(layerId: MapLayerId, event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    this.layerVisibility.update(layers => ({ ...layers, [layerId]: visible }));
    this.layerService.setLayerVisibility(layerId, visible);
  }

  setDrawMode(mode: 'line' | 'circle' | null): void {
    const nextMode = this.drawMode() === mode ? null : mode;
    this.drawMode.set(nextMode);
    this.shapeService.setDrawMode(nextMode);
  }

  deleteSelectedShapes(): void {
    this.shapeService.removeSelectedShapes();
  }

  deleteAllShapes(): void {
    this.shapeService.clearShapes();
  }

  refreshVehiclePositions(): void {
    console.log('Refreshing vehicle positions...');
    const map = this.mapService.getMap();
    if (!map) return;

    void this.refreshVehiclePositionsAndRoutes(map);
  }

  focusVehicle(vehicle: VehiclePosition): void {
    const longitude = vehicle.longitude;
    const latitude = vehicle.latitude;
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)
      || typeof latitude !== 'number' || !Number.isFinite(latitude)) return;

    this.mapService.focusOnCoordinates(longitude, latitude);
    void this.showVehicleRoute(vehicle);
  }

  onVehiclesChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const previousIds = this.selectedVehicleIds();
    const selectedIds = Array.from(select.selectedOptions, option => option.value);
    this.selectedVehicleIds.set(selectedIds);

    const newlySelectedId = selectedIds.find(id => !previousIds.includes(id));
    const activeId = newlySelectedId ?? selectedIds.at(-1);
    const activeVehicle = this.mappableVehicles().find(vehicle => getVehicleSelectionKey(vehicle) === activeId);
    if (activeVehicle) {
      this.focusVehicle(activeVehicle);
    } else if (selectedIds.length === 0) {
      this.vehicleRouteRequest++;
      this.layerService.setVehicleRouteShape(null);
    }
  }

  vehicleOptionLabel(vehicle: VehiclePosition, index: number): string {
    const vehicleId = vehicle.id || vehicle.tripId || `Position ${index + 1}`;
    return `${this.vehicleRouteShortName(vehicle)} · ${this.vehicleAgencyName(vehicle)} · ${vehicleId}`;
  }

  vehicleSelectionKey(vehicle: VehiclePosition): string {
    return getVehicleSelectionKey(vehicle);
  }

  vehicleRouteShortName(vehicle: VehiclePosition): string {
    const route = this.routesById().get(vehicle.routeId ?? '');
    return route?.routeShortName || vehicle.routeId || 'Unknown route';
  }

  vehicleAgencyName(vehicle: VehiclePosition): string {
    return this.routesById().get(vehicle.routeId ?? '')?.agencyName || 'Agency unknown';
  }

  private setSelectedLines(routeIds: string[]): void {
    const selectedRouteIds = [...new Set(routeIds)];
    this.selectedLines.set(selectedRouteIds);
    this.layerService.setVisibleStopIds(selectedRouteIds.length === 0 ? null : []);
    if (this.mapReady) void this.loadSelectedRouteShapes(selectedRouteIds);
  }

  private async loadSelectedRouteShapes(routeIds: readonly string[]): Promise<void> {
    const request = ++this.selectionRequest;
    const map = this.mapService.getMap();
    if (!map) return;

    this.loadError.set(false);
    if (routeIds.length === 0) {
      this.layerService.setRouteShapes(map, new Map());
      return;
    }

    try {
      const tripsByRoute = await Promise.all(routeIds.map(async routeId => [
        routeId,
        await firstValueFrom(this.tripService.getTripsByRouteId(routeId))
      ] as const));
      const shapeIdsByRoute = new Map<string, Set<string>>();
      const tripIds = new Set<string>();
      for (const [routeId, trips] of tripsByRoute) {
        const shapeIds = new Set(trips.map(trip => trip.shapeId).filter(isString));
        shapeIdsByRoute.set(routeId, shapeIds);
        trips.map(trip => trip.tripId).filter(isString).forEach(tripId => tripIds.add(tripId));
      }

      const shapeIds = new Set([...shapeIdsByRoute.values()].flatMap(ids => [...ids]));
      const [stopTimes, shapes] = await Promise.all([
        tripIds.size > 0
          ? firstValueFrom(this.stopTimeService.getStopTimesByTripIds([...tripIds]))
          : Promise.resolve([]),
        shapeIds.size > 0
          ? firstValueFrom(this.shapeController.getShapesBatch([...shapeIds]))
          : Promise.resolve([])
      ]);
      if (request !== this.selectionRequest) return;

      this.layerService.setVisibleStopIds([...new Set(stopTimes.map(stopTime => stopTime.stopId).filter(isString))]);

      const shapesById = new Map<string, ShapeEntity[]>();
      for (const shape of shapes) {
        if (!isString(shape.shapeId)) continue;
        const points = shapesById.get(shape.shapeId) ?? [];
        points.push(shape);
        shapesById.set(shape.shapeId, points);
      }
      const shapesByRoute = new Map<string, ShapeEntity[][]>();
      for (const [routeId, routeShapeIds] of shapeIdsByRoute) {
        shapesByRoute.set(routeId, [...routeShapeIds]
          .map(shapeId => shapesById.get(shapeId) ?? [])
          .filter(shape => shape.length > 0));
      }
      this.layerService.setRouteShapes(map, shapesByRoute);
    } catch {
      if (request === this.selectionRequest) this.loadError.set(true);
    }
  }

  private async loadStationStopTimes(stop: StopEntity): Promise<void> {
    const request = ++this.stationTimetableRequest;
    this.stationStopTimes.set([]);
    this.stationStopTimesLoading.set(true);
    this.stationStopTimesError.set(false);

    try {
      if (!isString(stop.stopId)) return;

      const stopTimes = await firstValueFrom(this.stopTimeService.getStopTimesByStopId(stop.stopId));
      const tripIds = [...new Set(stopTimes.map(stopTime => stopTime.tripId).filter(isString))];
      const trips = tripIds.length > 0
        ? await firstValueFrom(this.tripService.getTripsByTripIds(tripIds))
        : [];
      if (request !== this.stationTimetableRequest) return;

      const routeIds = [...new Set(trips.map(trip => trip.routeId).filter(isString))];
      this.stationRouteIds.set(routeIds);
      this.layerService.setHighlightedVehicleRouteIds(routeIds);
      const tripsById = new Map(trips.filter(trip => isString(trip.tripId)).map(trip => [trip.tripId, trip] as const));
      const missingRouteIds = [...new Set(trips
        .filter(trip => !isString(trip.tripShortName) && isString(trip.routeId))
        .map(trip => trip.routeId)
        .filter(isString))];
      const routeNames = await Promise.all(missingRouteIds.map(async routeId => {
        try {
          const response: unknown = await firstValueFrom(this.agencyRouteService.getAgencyRoute(routeId));
          return [routeId, findAgencyRoute(response, routeId)?.routeShortName] as const;
        } catch {
          return [routeId, undefined] as const;
        }
      }));
      if (request !== this.stationTimetableRequest) return;

      const routeShortNames = new Map(routeNames.filter((entry): entry is readonly [string, string] => isString(entry[1])));
      this.stationStopTimes.set(stopTimes.map((stopTime, index) => ({
        id: `${stopTime.tripId ?? 'trip'}-${stopTime.stopSequence ?? index}`,
        tripId: stopTime.tripId,
        tripShortName: stopTime.tripId
          ? tripsById.get(stopTime.tripId)?.tripShortName
            || routeShortNames.get(tripsById.get(stopTime.tripId)?.routeId ?? '')
          : undefined,
        arrivalTime: stopTime.arrivalTime,
        departureTime: stopTime.departureTime
      })).sort(compareStationStopTimes));
    } catch {
      if (request === this.stationTimetableRequest) this.stationStopTimesError.set(true);
    } finally {
      if (request === this.stationTimetableRequest) this.stationStopTimesLoading.set(false);
    }
  }

  private async showVehicleRoute(vehicle: VehiclePosition): Promise<void> {
    const request = ++this.vehicleRouteRequest;
    this.layerService.setVehicleRouteShape(null);

    try {
      let trips = isString(vehicle.tripId)
        ? await firstValueFrom(this.tripService.getTripsByTripIds([vehicle.tripId]))
        : [];
      if (!trips.some(trip => isString(trip.shapeId)) && isString(vehicle.routeId)) {
        trips = await firstValueFrom(this.tripService.getTripsByRouteId(vehicle.routeId));
      }
      if (request !== this.vehicleRouteRequest) return;

      const shapeId = trips.find(trip => isString(trip.shapeId))?.shapeId;
      if (!isString(shapeId)) return;

      const shapes = await firstValueFrom(this.shapeController.getShapesBatch([shapeId]));
      if (request === this.vehicleRouteRequest) this.layerService.setVehicleRouteShape(shapes);
    } catch {
      if (request === this.vehicleRouteRequest) this.layerService.setVehicleRouteShape(null);
    }
  }

  private async refreshVehiclePositionsAndRoutes(map: NonNullable<ReturnType<MapService['getMap']>>): Promise<void> {
    const request = ++this.vehicleRouteResolutionRequest;
    try {
      await this.layerService.refreshVehiclePositions(map);
      const availableVehicleIds = new Set(this.mappableVehicles().map(getVehicleSelectionKey));
      this.selectedVehicleIds.update(ids => ids.filter(id => availableVehicleIds.has(id)));
      const tripIds = [...new Set(this.vehiclePositions()
        .filter(position => !isString(position.routeId) && isString(position.tripId))
        .map(position => position.tripId)
        .filter(isString))];
      const trips = tripIds.length > 0
        ? await firstValueFrom(this.tripService.getTripsByTripIds(tripIds))
        : [];
      if (request !== this.vehicleRouteResolutionRequest) return;

      const routeIdsByTripId = new Map<string, string>();
      for (const trip of trips) {
        if (isString(trip.tripId) && isString(trip.routeId)) {
          routeIdsByTripId.set(trip.tripId, trip.routeId);
        }
      }
      this.vehicleRouteIdsByTripId.set(routeIdsByTripId);
      this.layerService.setVehicleTripRouteIds(routeIdsByTripId);
    } catch {
      if (request === this.vehicleRouteResolutionRequest) {
        this.vehicleRouteIdsByTripId.set(new Map());
        this.layerService.setVehicleTripRouteIds(new Map());
      }
    }
  }

  private centerStationTimetable(viewport: HTMLDivElement): void {
    const anchor = viewport.querySelector<HTMLElement>('.stop-time-anchor');
    if (!anchor) return;
    viewport.scrollTop = anchor.offsetTop - viewport.offsetTop
      + anchor.offsetHeight / 2
      - viewport.clientHeight / 2;
  }

  private async initializeMap(): Promise<void> {
    try {
      await this.mapService.createMap(this.mapElement.nativeElement);
      const map = this.mapService.getMap();
      if (!map) throw new Error('Map creation did not produce a map instance.');
      this.boundMap = map;
      this.stationMeasurement.initialize(map);
      map.on('singleclick', this.handleMapSingleClick);
      this.mapReady = true;
      this.refreshVehiclePositions();
      void this.loadSelectedRouteShapes(this.selectedLines());
    } catch {
      this.loadError.set(true);
    }
  }

  private readonly handleMapSingleClick = (event: MapBrowserEvent): void => {
    this.onMapSingleClick(event);
  };
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

const agencyRouteCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareAgencyRoutes(first: AgencyRouteEntity, second: AgencyRouteEntity): number {
  const labelComparison = agencyRouteCollator.compare(getAgencyRouteLabel(first), getAgencyRouteLabel(second));
  return labelComparison || (first.routeId ?? '').localeCompare(second.routeId ?? '');
}

function getAgencyRouteLabel(route: AgencyRouteEntity): string {
  const routeName = route.routeShortName || route.routeLongName || route.routeId || '';
  return route.agencyName ? `${route.agencyName} - ${routeName}` : routeName;
}

function findAgencyRoute(response: unknown, routeId: string): AgencyRouteEntity | undefined {
  const routes = Array.isArray(response) ? response : [response];
  return routes.find((route): route is AgencyRouteEntity =>
    typeof route === 'object' && route !== null
    && 'routeId' in route && route.routeId === routeId
  );
}

function normalizeRouteSearch(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const routeTypeLabels: Record<string, string> = {
  '0': 'Tram',
  '1': 'Subway',
  '2': 'Rail',
  '3': 'Bus',
  '4': 'Ferry',
  '5': 'Cable tram',
  '6': 'Aerial lift',
  '7': 'Funicular',
  '11': 'Trolleybus',
  '12': 'Monorail'
};

function getRouteTypeLabel(routeType: string | undefined): string {
  return routeType ? routeTypeLabels[routeType] ?? `Route type ${routeType}` : 'Unknown type';
}

interface StationStopTimeRow {
  id: string;
  tripId?: string;
  tripShortName?: string;
  arrivalTime?: string;
  departureTime?: string;
}

interface StationTimetableRow extends StationStopTimeRow {
  status: 'past' | 'next' | 'upcoming' | 'untimed';
  relativeTime: string;
  isTimeAnchor: boolean;
}

function compareStationStopTimes(first: StationStopTimeRow, second: StationStopTimeRow): number {
  const firstTime = timeToSeconds(first.arrivalTime ?? first.departureTime);
  const secondTime = timeToSeconds(second.arrivalTime ?? second.departureTime);
  return firstTime - secondTime
    || agencyRouteCollator.compare(first.tripShortName ?? first.tripId ?? '', second.tripShortName ?? second.tripId ?? '');
}

function timeToSeconds(time: string | undefined): number {
  if (!time) return Number.POSITIVE_INFINITY;
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)
    ? hours * 3600 + minutes * 60 + seconds
    : Number.POSITIVE_INFINITY;
}

function localTimeSeconds(timestamp: number): number {
  const current = new Date(timestamp);
  return current.getHours() * 3600 + current.getMinutes() * 60 + current.getSeconds();
}

function buildStationTimetableRows(rows: StationStopTimeRow[], currentTime: number): StationTimetableRow[] {
  const departures = rows.map(row => ({ row, seconds: timeToSeconds(row.departureTime ?? row.arrivalTime) }))
    .filter(entry => Number.isFinite(entry.seconds));
  const futureDepartures = departures.filter(entry => entry.seconds >= currentTime)
    .sort((first, second) => first.seconds - second.seconds);
  const pastDepartures = departures.filter(entry => entry.seconds < currentTime)
    .sort((first, second) => second.seconds - first.seconds);
  const nextId = futureDepartures[0]?.row.id;
  const anchorId = nextId ?? pastDepartures[0]?.row.id;

  return rows.map(row => {
    const departureTime = timeToSeconds(row.departureTime ?? row.arrivalTime);
    const arrivalTime = timeToSeconds(row.arrivalTime);
    const isPast = departureTime < currentTime;
    const status: StationTimetableRow['status'] = !Number.isFinite(departureTime)
      ? 'untimed'
      : isPast ? 'past' : row.id === nextId ? 'next' : 'upcoming';
    const relativeTime = isPast
      ? `${formatRelativeDuration(currentTime - departureTime)} ago`
      : Number.isFinite(arrivalTime) && arrivalTime >= currentTime
        ? `in ${formatRelativeDuration(arrivalTime - currentTime)}`
        : Number.isFinite(departureTime)
          ? `in ${formatRelativeDuration(departureTime - currentTime)}`
          : '—';
    return { ...row, status, relativeTime, isTimeAnchor: row.id === anchorId };
  });
}

function formatRelativeDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function isMappableVehicle(value: unknown): value is VehiclePosition {
  if (typeof value !== 'object' || value === null) return false;
  const vehicle = value as VehiclePosition;
  return typeof vehicle.longitude === 'number' && Number.isFinite(vehicle.longitude)
    && typeof vehicle.latitude === 'number' && Number.isFinite(vehicle.latitude);
}

function getVehicleSelectionKey(vehicle: VehiclePosition): string {
  if (isString(vehicle.id)) return `id:${vehicle.id}`;
  if (isString(vehicle.tripId)) return `trip:${vehicle.tripId}`;
  return `position:${vehicle.routeId ?? ''}:${vehicle.latitude}:${vehicle.longitude}`;
}

function isStopEntity(value: unknown): value is StopEntity {
  return typeof value === 'object' && value !== null
    && 'stopId' in value && (typeof value.stopId === 'string' || value.stopId === undefined);
}

function hasStopCoordinates(stop: StopEntity): stop is StopEntity & { longitude: number; latitude: number } {
  return typeof stop.longitude === 'number' && Number.isFinite(stop.longitude)
    && typeof stop.latitude === 'number' && Number.isFinite(stop.latitude);
}