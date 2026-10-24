import { TestBed } from '@angular/core/testing';
import View from 'ol/View';
import { delay, of, Subject, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

import { RouteControllerService, ShapeControllerService } from '../api/generated';
import { RouteShapesLayerService } from '../layer/route-shapes-layer.service';
import { StopsLayerService } from '../layer/stops-layer.service';
import { MapService } from '../map/map.service';
import { RouteSelectionService } from './route-selection.service';

describe('RouteSelectionService', () => {
  // A real view at about zoom 11 over Göteborg, so extents and projections behave as on the map
  const view = new View({ center: [1_336_700, 7_910_600], resolution: 76.4 });
  const fakeMap = { getSize: () => [800, 600], getView: () => view };
  let stopIdsFor: (routeIds: string[]) => Observable<string[]>;
  let getShapeLines: ReturnType<typeof vi.fn>;
  let getRouteIdsWithinBounds: ReturnType<typeof vi.fn>;
  let setRouteShapes: ReturnType<typeof vi.fn>;
  let setVisibleStopIds: ReturnType<typeof vi.fn>;
  let service: RouteSelectionService;

  const settle = async (check: () => void) => vi.waitFor(() => {
    TestBed.tick();
    check();
  });

  beforeEach(() => {
    stopIdsFor = routeIds => of(routeIds.map(routeId => `stop-of-${routeId}`));
    getShapeLines = vi.fn((shapeIds: string[]) => of(shapeIds.map(shapeId => ({ shapeId, coordinates: [[12, 57.7], [12.1, 57.8]] }))));
    getRouteIdsWithinBounds = vi.fn(() => of(['route-b']));
    setRouteShapes = vi.fn();
    setVisibleStopIds = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: RouteControllerService, useValue: {
          getRouteIdsWithinBounds,
          getStopIdsForRoutes: (routeIds: string[]) => stopIdsFor(routeIds),
          // Two shapes per route, one of them shared by every route
          getShapeIdsForRoutes: (routeIds: string[]) => of(routeIds.flatMap(routeId => [
            { routeId, shapeId: `shape-of-${routeId}` },
            { routeId, shapeId: 'shared-shape' }
          ]))
        } },
        { provide: ShapeControllerService, useValue: { getShapeLines } },
        { provide: MapService, useValue: { getMap: () => fakeMap } },
        { provide: RouteShapesLayerService, useValue: { setRouteShapes } },
        { provide: StopsLayerService, useValue: { setVisibleStopIds } }
      ]
    });
    service = TestBed.inject(RouteSelectionService);
  });

  it('draws the selected routes and shows only their stops', async () => {
    service.select(['route-a', 'route-a']);
    expect(service.selectedRouteIds()).toEqual(['route-a']);

    await settle(() => expect(setVisibleStopIds).toHaveBeenLastCalledWith(['stop-of-route-a']));
    const linesByRoute = setRouteShapes.mock.lastCall![1] as Map<string, number[][][]>;
    expect([...linesByRoute.keys()]).toEqual(['route-a']);
    expect(linesByRoute.get('route-a')).toEqual([[[12, 57.7], [12.1, 57.8]], [[12, 57.7], [12.1, 57.8]]]);
  });

  it('fetches each shape once, simplified to the current zoom', async () => {
    service.select(['route-a', 'route-b']);
    await settle(() => expect(getShapeLines).toHaveBeenCalled());

    const [shapeIds, tolerance] = getShapeLines.mock.lastCall!;
    expect(shapeIds).toEqual(['shape-of-route-a', 'shared-shape', 'shape-of-route-b']);
    expect(tolerance).toBeCloseTo(76.4 * 0.5 / 111_319.49);   // half a pixel at zoom 11
  });

  it('ignores a slow response for a selection that has since changed', async () => {
    const slowA = new Subject<string[]>();
    stopIdsFor = routeIds => routeIds.includes('route-a') ? slowA : of(routeIds.map(routeId => `stop-of-${routeId}`));
    service.select(['route-a']);
    TestBed.tick();
    service.select(['route-b']);
    await settle(() => expect(setVisibleStopIds).toHaveBeenLastCalledWith(['stop-of-route-b']));

    slowA.next(['stop-of-route-a']);
    slowA.complete();
    TestBed.tick();

    expect(setVisibleStopIds).not.toHaveBeenCalledWith(['stop-of-route-a']);
    expect([...(setRouteShapes.mock.lastCall![1] as Map<string, unknown>).keys()]).toEqual(['route-b']);
  });

  it('shows every stop again when nothing is selected', async () => {
    service.select(['route-a']);
    await settle(() => expect(setVisibleStopIds).toHaveBeenLastCalledWith(['stop-of-route-a']));

    service.select([]);
    TestBed.tick();

    expect(setVisibleStopIds).toHaveBeenLastCalledWith(null);
    expect(setRouteShapes).toHaveBeenLastCalledWith(fakeMap, new Map());
  });

  it('selects the routes serving stops in view, each time it is asked', async () => {
    service.selectRoutesInView();
    await settle(() => expect(service.selectedRouteIds()).toEqual(['route-b']));

    service.select([]);
    service.selectRoutesInView();
    await settle(() => expect(service.selectedRouteIds()).toEqual(['route-b']));
    expect(getRouteIdsWithinBounds).toHaveBeenCalledTimes(2);
  });

  it('reports a failed load', async () => {
    stopIdsFor = () => throwError(() => new Error('offline')).pipe(delay(0));
    service.select(['route-a']);
    await settle(() => expect(service.loadError()).toBe(true));
  });
});
