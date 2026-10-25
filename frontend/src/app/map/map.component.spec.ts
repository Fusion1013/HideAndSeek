import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { routes } from '../app.routes';
import { MapComponent } from './map.component';
import { LayerService } from '../layer/layer.service';
import { MAP_LAYERS } from '../layer/map-layers';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { VEHICLE_REFRESH_MS } from '../vehicle/vehicle-refresh';
import { VehicleSelectionService } from '../vehicle/vehicle-selection.service';
import { RouteSelectionService } from '../transit/route-selection.service';
import { StationTimetableService } from '../station/station-timetable.service';
import { RouteShapesLayerService } from '../layer/route-shapes-layer.service';
import { StopsLayerService } from '../layer/stops-layer.service';
import { VehicleLayerService } from '../layer/vehicle-layer.service';
import { MapService } from './map.service';
import { TransitService as TransitDataService } from '../transit/transit.service';
import { TransitService as TransitApiService } from '../api/generated/api/transit.service';
import { AgencyRouteControllerService, RouteControllerService, ShapeControllerService, StopControllerService, StopTimeControllerService, TripControllerService } from '../api/generated';
import { StationMeasurementService } from '../layer/station-measurement.service';
import Feature from 'ol/Feature';
import View from 'ol/View';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { of } from 'rxjs';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });

    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideRouter(routes),
        { provide: AgencyRouteControllerService, useValue: { getAgencyRoutes: () => of([
          { routeId: 'beta-a', agencyName: 'Beta', routeShortName: 'A', routeType: '2' },
          { routeId: 'alpha-10', agencyName: 'Alpha', routeShortName: '10', routeType: '3' },
          { routeId: 'alpha-2', agencyName: 'Alpha', routeShortName: '2', routeType: '3' }
        ]), getAgencyRoute: () => of([]) } },
        { provide: StopControllerService, useValue: { getStops: () => of([]), getStopsWithinBounds: () => of([]) } },
        { provide: StopTimeControllerService, useValue: { getStopTimes: () => of([]), getStopTimesByStopId: () => of([]), getStopTimesByStopIds: () => of([]), getStopTimesByTripIds: () => of([]) } },
        { provide: TripControllerService, useValue: { getTrips: () => of([]), getTripsByRouteId: () => of([]), getTripsByTripIds: () => of([]) } },
        { provide: ShapeControllerService, useValue: { getShapesBatch: () => of([]), getShapeLines: () => of([]) } },
        { provide: RouteControllerService, useValue: {
          getRouteIdsWithinBounds: () => of([]), getStopIdsForRoutes: () => of([]), getShapeIdsForRoutes: () => of([])
        } },
        { provide: TransitApiService, useValue: { getVehiclePositions: () => of([]) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    // The tabs tested here belong to Overview mode, whose panel comes through the router
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps controls hidden until opened and renders only the active menu', () => {
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    const panel = fixture.nativeElement.querySelector('#map-controls-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(controlsToggle.textContent?.trim()).toBe('');
    expect(controlsToggle.getAttribute('aria-label')).toBe('Open map controls');

    controlsToggle.click();
    fixture.detectChanges();
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(controlsToggle.getAttribute('aria-label')).toBe('Close map controls');
    expect(fixture.nativeElement.querySelector('#line-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('section[aria-label="Measure shapes"]')).toBeNull();

    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    const vehiclesMenuButton = Array.from(menuButtons)
      .find(button => button.getAttribute('aria-label') === 'Vehicles');
    expect(vehiclesMenuButton).toBeTruthy();
    vehiclesMenuButton?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#line-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Vehicle positions"]')).toBeTruthy();

    const measureMenuButton = Array.from(menuButtons)
      .find(button => button.getAttribute('aria-label') === 'Measure shapes');
    expect(measureMenuButton).toBeTruthy();
    measureMenuButton?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#line-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('section[aria-label="Measure shapes"]')).toBeTruthy();

    controlsToggle.click();
    fixture.detectChanges();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows agency names before route labels and sorts the list by displayed label', () => {
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('#line-select option') as NodeListOf<HTMLOptionElement>;
    expect(Array.from(options, option => option.textContent?.trim())).toEqual([
      'Alpha - 2',
      'Alpha - 10',
      'Beta - A'
    ]);
  });

  it('filters routes by search text, agency, and mode', () => {
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#route-search') as HTMLInputElement;
    search.value = 'ALPHA 10';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    let options = fixture.nativeElement.querySelectorAll('#line-select option') as NodeListOf<HTMLOptionElement>;
    expect(Array.from(options, option => option.textContent?.trim())).toEqual(['Alpha - 10']);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const agencyFilter = fixture.nativeElement.querySelector('#agency-filter') as HTMLSelectElement;
    agencyFilter.value = 'Alpha';
    agencyFilter.dispatchEvent(new Event('change'));
    const modeFilter = fixture.nativeElement.querySelector('#route-type-filter') as HTMLSelectElement;
    modeFilter.value = '3';
    modeFilter.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    options = fixture.nativeElement.querySelectorAll('#line-select option') as NodeListOf<HTMLOptionElement>;
    expect(Array.from(options, option => option.textContent?.trim())).toEqual(['Alpha - 2', 'Alpha - 10']);
    expect(Array.from(modeFilter.options).map(option => option.textContent?.trim())).toEqual(['All modes', 'Rail', 'Bus']);

    const selectShownButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Select shown');
    selectShownButton?.click();
    expect(TestBed.inject(RouteSelectionService).selectedRouteIds()).toEqual(['alpha-2', 'alpha-10']);

    const clearFiltersButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Clear filters');
    expect(clearFiltersButton).toBeTruthy();
    if (!clearFiltersButton) return;
    clearFiltersButton.click();
    fixture.detectChanges();
    expect(search.value).toBe('');
    expect(agencyFilter.value).toBe('');
    expect(modeFilter.value).toBe('');
    expect(fixture.nativeElement.querySelectorAll('#line-select option')).toHaveLength(3);
  });

  it('selects a clicked stop and keeps its station tab available while selected', () => {
    const stop = {
      stopId: 'station-1',
      stopName: 'Central Station',
      stopCode: 'CEN',
      latitude: 57.7,
      longitude: 12.0
    };
    const stopFeature = new Feature({ stop });
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({
      forEachFeatureAtPixel: (_pixel: unknown, callback: (feature: Feature) => unknown) => callback(stopFeature)
    } as never);

    component.onMapSingleClick({ pixel: [1, 1], coordinate: [100, 200] } as never);
    TestBed.tick();
    fixture.detectChanges();

    expect(TestBed.inject(StationMeasurementService).selectedStop()).toEqual(stop);
    expect(TestBed.inject(ControlsPanelService).open()).toBe(true);
    expect(TestBed.inject(ControlsPanelService).activeMenu()).toBe('station');
    expect(fixture.nativeElement.querySelector('[aria-label="Selected station details"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Central Station');

    const transitTab = fixture.nativeElement.querySelector('[aria-label="Transit routes"]') as HTMLButtonElement;
    transitTab.click();
    fixture.detectChanges();
    const stationTab = fixture.nativeElement.querySelector('[aria-label="Selected station"]') as HTMLButtonElement;
    expect(stationTab).toBeTruthy();
    stationTab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Selected station details"]')).toBeTruthy();
  });

  it('loads and chronologically displays station times with trip short names', async () => {
    const now = new Date();
    now.setHours(8, 30, 0, 0);
    const stop = { stopId: 'station-1', stopName: 'Central Station', latitude: 57.7, longitude: 12 };
    const stopFeature = new Feature({ stop });
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({
      forEachFeatureAtPixel: (_pixel: unknown, callback: (feature: Feature) => unknown) => callback(stopFeature)
    } as never);
    const getStopTimesByStopId = vi.spyOn(TestBed.inject(StopTimeControllerService), 'getStopTimesByStopId')
      .mockReturnValue(of([
        { tripId: 'trip-later', stopSequence: 2, arrivalTime: '09:10:00', departureTime: '09:11:00' },
        { tripId: 'trip-earlier', stopSequence: 1, arrivalTime: '08:00:00', departureTime: '08:02:00' },
        { tripId: 'trip-no-short-name', stopSequence: 0, arrivalTime: '07:15:00', departureTime: '07:16:00' }
      ]) as never);
    const getTripsByTripIds = vi.spyOn(TestBed.inject(TripControllerService), 'getTripsByTripIds')
      .mockReturnValue(of([
        { tripId: 'trip-later', tripShortName: 'Later', routeId: 'route-later' },
        { tripId: 'trip-earlier', tripShortName: 'Early', routeId: 'route-earlier' },
        { tripId: 'trip-no-short-name', routeId: 'alpha-2' }
      ]) as never);
    const highlightRoutes = vi.spyOn(TestBed.inject(VehicleLayerService), 'setHighlightedRouteIds');

    component.onMapSingleClick({ pixel: [1, 1], coordinate: [100, 200] } as never);
    const timetable = TestBed.inject(StationTimetableService);
    await vi.waitFor(() => expect(timetable.rows()).toHaveLength(3));
    timetable.clock.set(now.getTime());
    TestBed.tick();
    fixture.detectChanges();

    expect(getStopTimesByStopId).toHaveBeenCalledWith('station-1');
    expect(getTripsByTripIds).toHaveBeenCalledWith(['trip-later', 'trip-earlier', 'trip-no-short-name']);
    expect(highlightRoutes).toHaveBeenCalledWith(['route-later', 'route-earlier', 'alpha-2']);
    const rows = fixture.nativeElement.querySelectorAll('.station-timetable tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(Array.from(rows, row => Array.from(row.cells, cell => cell.textContent?.trim()))).toEqual([
      ['2', '07:15:00', '07:16:00', '1 hr 14 min ago'],
      ['Early', '08:00:00', '08:02:00', '28 min ago'],
      ['Later', '09:10:00', '09:11:00', 'in 40 min']
    ]);
    expect(rows[0].classList.contains('stop-time-past')).toBe(true);
    expect(rows[1].classList.contains('stop-time-past')).toBe(true);
    expect(rows[2].classList.contains('stop-time-next')).toBe(true);
    expect(rows[2].classList.contains('stop-time-anchor')).toBe(true);
  });

  it('toggles a map layer from the Layers menu', () => {
    const setLayerVisibility = vi.spyOn(TestBed.inject(LayerService), 'setLayerVisibility');
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();

    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    const layersMenuButton = Array.from(menuButtons)
      .find(button => button.getAttribute('aria-label') === 'Map layers');
    layersMenuButton?.click();
    fixture.detectChanges();

    const layerInputs = fixture.nativeElement.querySelectorAll('.layer-toggle input') as NodeListOf<HTMLInputElement>;
    expect(Array.from(layerInputs, input => input.closest('label')?.textContent?.trim()))
      .toEqual(MAP_LAYERS.map(layer => layer.label));
    expect(Array.from(layerInputs, input => input.checked)).toEqual(MAP_LAYERS.map(layer => layer.visible));
    layerInputs[0].click();
    fixture.detectChanges();

    expect(layerInputs[0].checked).toBe(false);
    expect(setLayerVisibility).toHaveBeenCalledWith('base-map', false);
  });

  it('refreshes vehicle positions when the map button is pressed', () => {
    const refresh = vi.spyOn(TestBed.inject(VehicleLayerService), 'refreshVehiclePositions').mockResolvedValue();
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();

    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    Array.from(menuButtons).find(button => button.getAttribute('aria-label') === 'Vehicles')?.click();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const refreshButton = Array.from(buttons)
      .find(button => button.textContent?.includes('Refresh vehicles'));
    expect(refreshButton).toBeTruthy();
    if (!refreshButton) return;
    refreshButton.click();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes vehicle positions on an interval while the vehicle layer is shown', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const refresh = vi.spyOn(TestBed.inject(VehicleLayerService), 'refreshVehiclePositions').mockResolvedValue();
      TestBed.inject(TransitDataService).vehiclePositionsUpdatedAt.set(Date.now());
      const layers = TestBed.inject(LayerService);

      vi.advanceTimersByTime(VEHICLE_REFRESH_MS * 2);
      expect(refresh).not.toHaveBeenCalled();   // layer hidden: no polling

      TestBed.inject(TransitDataService).vehiclePositionsUpdatedAt.set(Date.now());
      layers.setLayerVisibility('vehicles', true);
      TestBed.tick();
      expect(refresh).not.toHaveBeenCalled();   // positions are fresh
      vi.advanceTimersByTime(VEHICLE_REFRESH_MS);
      expect(refresh).toHaveBeenCalledTimes(1);

      layers.setLayerVisibility('vehicles', false);
      TestBed.tick();
      vi.advanceTimersByTime(VEHICLE_REFRESH_MS * 3);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the route short name and agency and draws its dotted shape when a sidebar vehicle is selected', async () => {
    const vehicle = {
      id: 'vehicle-1',
      tripId: 'trip-1',
      routeId: 'alpha-10',
      latitude: 57.7848,
      longitude: 14.2271
    };
    TestBed.inject(TransitDataService).vehiclePositions.set([vehicle]);
    const focus = vi.spyOn(TestBed.inject(MapService), 'focusOnCoordinates');
    const getTripsByTripIds = vi.spyOn(TestBed.inject(TripControllerService), 'getTripsByTripIds')
      .mockReturnValue(of([{ tripId: vehicle.tripId, shapeId: 'shape-1' }]) as never);
    const shapes = [{ shapeId: 'shape-1', shapePtSequence: 1, shapePtLat: 57.7, shapePtLon: 12 }];
    vi.spyOn(TestBed.inject(ShapeControllerService), 'getShapesBatch').mockReturnValue(of(shapes) as never);
    const setVehicleRouteShape = vi.spyOn(TestBed.inject(RouteShapesLayerService), 'setVehicleRouteShape');
    fixture.detectChanges();

    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();
    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    Array.from(menuButtons).find(button => button.getAttribute('aria-label') === 'Vehicles')?.click();
    fixture.detectChanges();
    const vehicleSelect = fixture.nativeElement.querySelector('#vehicle-select') as HTMLSelectElement;
    expect(vehicleSelect).toBeTruthy();
    expect(vehicleSelect.options[0].textContent?.trim()).toContain('10 · Alpha');
    vehicleSelect.options[0].selected = true;
    vehicleSelect.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(setVehicleRouteShape).toHaveBeenCalledWith(shapes));

    expect(focus).toHaveBeenCalledWith(vehicle.longitude, vehicle.latitude);
    expect(getTripsByTripIds).toHaveBeenCalledWith([vehicle.tripId]);
    expect(TestBed.inject(VehicleSelectionService).selectedVehicles()).toEqual([vehicle]);
  });

  it('keeps multiple vehicle options selected together', () => {
    const firstVehicle = { id: 'vehicle-1', tripId: 'trip-1', routeId: 'alpha-10', latitude: 57.7, longitude: 12 };
    const secondVehicle = { id: 'vehicle-2', tripId: 'trip-2', routeId: 'beta-a', latitude: 57.8, longitude: 12.1 };
    TestBed.inject(TransitDataService).vehiclePositions.set([firstVehicle, secondVehicle]);
    fixture.detectChanges();

    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();
    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    Array.from(menuButtons).find(button => button.getAttribute('aria-label') === 'Vehicles')?.click();
    fixture.detectChanges();

    const vehicleSelect = fixture.nativeElement.querySelector('#vehicle-select') as HTMLSelectElement;
    expect(vehicleSelect.multiple).toBe(true);
    vehicleSelect.options[0].selected = true;
    vehicleSelect.options[1].selected = true;
    vehicleSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(TestBed.inject(VehicleSelectionService).selectedVehicles()).toHaveLength(2);
    expect(Array.from(vehicleSelect.selectedOptions)).toHaveLength(2);
  });

  it('resolves a route short name for a vehicle that only has a trip ID', async () => {
    const vehicle = { id: 'trip-only-vehicle', tripId: 'trip-only', latitude: 57.7, longitude: 12 };
    const transitService = TestBed.inject(TransitDataService);
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({} as never);
    vi.spyOn(TestBed.inject(VehicleLayerService), 'refreshVehiclePositions').mockImplementation(async () => {
      transitService.vehiclePositions.set([vehicle]);
    });
    const getTripsByTripIds = vi.spyOn(TestBed.inject(TripControllerService), 'getTripsByTripIds')
      .mockReturnValue(of([{ tripId: 'trip-only', routeId: 'alpha-10' }]) as never);
    const setVehicleTripRouteIds = vi.spyOn(TestBed.inject(VehicleLayerService), 'setTripRouteIds');

    void TestBed.inject(VehicleSelectionService).refresh();
    await vi.waitFor(() => expect(TestBed.inject(VehicleSelectionService).vehicles()[0]?.routeId).toBe('alpha-10'));
    TestBed.tick();

    expect(getTripsByTripIds).toHaveBeenCalledWith(['trip-only']);
    expect(setVehicleTripRouteIds).toHaveBeenCalledWith(new Map([['trip-only', 'alpha-10']]));
    TestBed.inject(ControlsPanelService).show('vehicles');
    fixture.detectChanges();
    const option = fixture.nativeElement.querySelector('#vehicle-select option') as HTMLOptionElement;
    expect(option.textContent?.trim()).toBe('10 · Alpha · trip-only-vehicle');
  });

  it('opens the vehicle tab and draws its route when a vehicle marker is clicked', async () => {
    const vehicle = { id: 'vehicle-map', tripId: 'trip-map', routeId: 'alpha-10', latitude: 57.7, longitude: 12 };
    TestBed.inject(TransitDataService).vehiclePositions.set([vehicle]);
    const vehicleFeature = new Feature({ vehicle });
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({
      forEachFeatureAtPixel: (_pixel: unknown, callback: (feature: Feature) => unknown) => callback(vehicleFeature)
    } as never);
    vi.spyOn(TestBed.inject(TripControllerService), 'getTripsByTripIds')
      .mockReturnValue(of([{ tripId: vehicle.tripId, shapeId: 'shape-map' }]) as never);
    const shapes = [{ shapeId: 'shape-map', shapePtSequence: 1, shapePtLat: 57.7, shapePtLon: 12 }];
    vi.spyOn(TestBed.inject(ShapeControllerService), 'getShapesBatch').mockReturnValue(of(shapes) as never);
    const setVehicleRouteShape = vi.spyOn(TestBed.inject(RouteShapesLayerService), 'setVehicleRouteShape');

    component.onMapSingleClick({ pixel: [1, 1], coordinate: [100, 200] } as never);
    await vi.waitFor(() => expect(setVehicleRouteShape).toHaveBeenCalledWith(shapes));
    fixture.detectChanges();

    expect(TestBed.inject(ControlsPanelService).open()).toBe(true);
    expect(TestBed.inject(ControlsPanelService).activeMenu()).toBe('vehicles');
    expect(TestBed.inject(VehicleSelectionService).selectedVehicles()).toHaveLength(1);
  });

  it('hides the vehicle route when the map is clicked away from a vehicle', async () => {
    const vehicle = { id: 'vehicle-map', tripId: 'trip-map', routeId: 'alpha-10', latitude: 57.7, longitude: 12 };
    TestBed.inject(TransitDataService).vehiclePositions.set([vehicle]);
    let clicked: Feature | undefined = new Feature({ vehicle });
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({
      forEachFeatureAtPixel: (_pixel: unknown, callback: (feature: Feature) => unknown) =>
        clicked ? callback(clicked) : undefined
    } as never);
    vi.spyOn(TestBed.inject(TripControllerService), 'getTripsByTripIds')
      .mockReturnValue(of([{ tripId: vehicle.tripId, shapeId: 'shape-map' }]) as never);
    const shapes = [{ shapeId: 'shape-map', shapePtSequence: 1, shapePtLat: 57.7, shapePtLon: 12 }];
    vi.spyOn(TestBed.inject(ShapeControllerService), 'getShapesBatch').mockReturnValue(of(shapes) as never);
    const setVehicleRouteShape = vi.spyOn(TestBed.inject(RouteShapesLayerService), 'setVehicleRouteShape');

    component.onMapSingleClick({ pixel: [1, 1], coordinate: [100, 200] } as never);
    await vi.waitFor(() => expect(setVehicleRouteShape).toHaveBeenCalledWith(shapes));

    clicked = undefined;   // empty map
    component.onMapSingleClick({ pixel: [50, 50], coordinate: [300, 400] } as never);
    TestBed.tick();

    expect(setVehicleRouteShape).toHaveBeenLastCalledWith(null);
    expect(TestBed.inject(VehicleSelectionService).selectedVehicles()).toHaveLength(0);
  });

  it('selects every route serving a stop inside the current view', async () => {
    const view = new View({ center: [0, 0], resolution: 10 });
    vi.spyOn(TestBed.inject(MapService), 'getMap').mockReturnValue({ getSize: () => [100, 100], getView: () => view } as never);
    const getRouteIdsWithinBounds = vi.spyOn(TestBed.inject(RouteControllerService), 'getRouteIdsWithinBounds')
      .mockReturnValue(of(['visible-route']) as never);
    const getStopIdsForRoutes = vi.spyOn(TestBed.inject(RouteControllerService), 'getStopIdsForRoutes')
      .mockReturnValue(of([]) as never);

    const selection = TestBed.inject(RouteSelectionService);
    selection.selectRoutesInView();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(selection.selectedRouteIds()).toEqual(['visible-route']);
    });
    expect(getRouteIdsWithinBounds).toHaveBeenCalledOnce();
    const [south, north, west, east] = getRouteIdsWithinBounds.mock.calls[0] as unknown as number[];
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
    await vi.waitFor(() => {
      TestBed.tick();
      expect(getStopIdsForRoutes).toHaveBeenCalledWith(['visible-route']);
    });
    expect(getStopIdsForRoutes).toHaveBeenCalledTimes(1);
  });

  it('filters stop visibility to stops served by the selected routes', async () => {
    const getStopIdsForRoutes = vi.spyOn(TestBed.inject(RouteControllerService), 'getStopIdsForRoutes')
      .mockReturnValue(of(['stop-a', 'stop-b']) as never);
    const setVisibleStopIds = vi.spyOn(TestBed.inject(StopsLayerService), 'setVisibleStopIds');

    const selection = TestBed.inject(RouteSelectionService);
    selection.select(['route-a']);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(setVisibleStopIds).toHaveBeenCalledWith(['stop-a', 'stop-b']);
    });
    expect(getStopIdsForRoutes).toHaveBeenCalledOnce();
    expect(getStopIdsForRoutes).toHaveBeenCalledWith(['route-a']);

    selection.select([]);
    TestBed.tick();
    expect(setVisibleStopIds).toHaveBeenLastCalledWith(null);
  });

  it('keeps the last positions when the API response is not an array', async () => {
    const vehicleService = TestBed.inject(TransitDataService);
    const previousPositions = [{ id: 'vehicle-1', latitude: 57.7848, longitude: 14.2271 }];
    vehicleService.vehiclePositions.set(previousPositions);
    vi.spyOn(TestBed.inject(TransitApiService), 'getVehiclePositions')
      .mockReturnValue(of({} as unknown as VehiclePosition[]) as never);

    await expect(vehicleService.refreshVehiclePositions())
      .rejects.toThrow('Vehicle positions response must be an array');

    expect(vehicleService.vehiclePositions()).toEqual(previousPositions);
    expect(vehicleService.vehiclePositionsError()).toBe(true);
    expect(TestBed.inject(VehicleSelectionService).vehicles()).toEqual(previousPositions);
  });
});
