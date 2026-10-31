import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { transformExtent } from 'ol/proj';

import { RouteControllerService, ShapeControllerService } from '../api/generated';
import { RouteShapesLayerService } from '../layer/route-shapes-layer.service';
import { StopsLayerService } from '../layer/stops-layer.service';
import { MapService } from '../map/map.service';
import { sameItems } from '../shared/guards';

/** Map units per degree of longitude in EPSG:3857, which is linear in longitude. */
const METERS_PER_DEGREE_LONGITUDE = 111_319.49;

/** About a metre: no finer detail is worth sending. */
const MIN_TOLERANCE = 0.00001;

/** Lines are loaded again once the view calls for a tolerance this many times finer than theirs. */
const REFINE_FACTOR = 2;

interface SelectedRoutesData {
  /** Each route's shapes, as [longitude, latitude] lines. */
  linesByRoute: Map<string, number[][][]>;
  /** Every stop served by the selected routes. */
  stopIds: string[];
  /** How far the lines were simplified, in degrees. */
  tolerance: number;
}

interface ViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The routes chosen on the Transit tab: drawn on the map, with only their stops shown. */
@Injectable({ providedIn: 'root' })
export class RouteSelectionService {
  private readonly routeApi = inject(RouteControllerService);
  private readonly shapeApi = inject(ShapeControllerService);
  private readonly mapService = inject(MapService);
  private readonly routeShapesLayer = inject(RouteShapesLayerService);
  private readonly stopsLayer = inject(StopsLayerService);

  readonly selectedRouteIds = signal<string[]>([], { equal: sameItems });

  /** Whether the view moves to fit the routes each time the selection changes. Create mode turns it off. */
  readonly fitView = signal(true);

  /** Whether the routes' stops are shown. Game mode shows the game's own stations instead. */
  readonly showStops = signal(true);

  private readonly selectedRoutes = rxResource({
    params: () => this.selectedRouteIds().length > 0 ? this.selectedRouteIds() : undefined,
    stream: ({ params: routeIds }) => this.loadRoutes(routeIds)
  });

  /** Set on each "Routes in view" request; a new object, so asking again for the same view still loads. */
  private readonly viewRequest = signal<ViewBounds | undefined>(undefined);

  private readonly routesInView = rxResource({
    params: this.viewRequest,
    stream: ({ params: bounds }) => this.loadRoutesInView(bounds)
  });

  readonly loadError = computed(() => this.selectedRoutes.error() !== undefined || this.routesInView.error() !== undefined);

  /** The tolerance the view called for when it last came to rest. */
  private readonly viewTolerance = signal(Infinity);

  /** The routes on the map, to tell new routes from finer lines for the same ones. */
  private drawnRouteIds: string[] = [];

  constructor() {
    effect(onCleanup => {
      const map = this.mapService.getMap();
      if (!map) return;
      const updateViewTolerance = () => this.viewTolerance.set(this.toleranceForView());
      map.on('moveend', updateViewTolerance);
      onCleanup(() => map.un('moveend', updateViewTolerance));
    });

    // Lines loaded at a wider zoom, such as the map's first view before a game's area is fitted, are too coarse for
    // a closer one. Also checked as each load ends: a reload asked for during a first load would be dropped.
    effect(() => {
      const tolerance = this.viewTolerance();
      if (this.selectedRoutes.isLoading() || !this.selectedRoutes.hasValue()) return;
      if (tolerance * REFINE_FACTOR <= this.selectedRoutes.value().tolerance) this.selectedRoutes.reload();
    });

    // Draw the selected routes, and show only their stops; existing shapes stay until new ones have loaded
    effect(() => {
      const map = this.mapService.getMap();
      if (this.selectedRouteIds().length === 0) {
        this.drawnRouteIds = [];
        this.stopsLayer.setVisibleStopIds(null);
        if (map) this.routeShapesLayer.setRouteShapes(map, new Map());
        return;
      }
      if (!this.selectedRoutes.hasValue()) {
        this.stopsLayer.setVisibleStopIds([]);
        return;
      }
      const { linesByRoute, stopIds } = this.selectedRoutes.value();
      this.stopsLayer.setVisibleStopIds(this.showStops() ? stopIds : []);
      if (!map) return;
      const routeIds = [...linesByRoute.keys()];
      const newRoutes = !sameItems(routeIds, this.drawnRouteIds);
      this.drawnRouteIds = routeIds;
      this.routeShapesLayer.setRouteShapes(map, linesByRoute, newRoutes && untracked(this.fitView));
    });

    // "Routes in view" replaces the selection once its routes are known
    effect(() => {
      if (this.routesInView.hasValue()) this.select(this.routesInView.value());
    });
  }

  select(routeIds: readonly string[]): void {
    this.selectedRouteIds.set([...new Set(routeIds)]);
  }

  /** Selects every route serving a stop in the current map view. */
  selectRoutesInView(): void {
    const map = this.mapService.getMap();
    const size = map?.getSize();
    if (!map || !size) return;

    const view = map.getView();
    const [west, south, east, north] = transformExtent(view.calculateExtent(size), view.getProjection(), 'EPSG:4326');
    this.viewRequest.set({ south, west, north, east });
  }

  /**
   * The routes' stops and shapes, each answered by the backend in one query however many routes there are.
   * Shapes come as lines simplified to half a pixel at the current zoom, so a wide view stays small; they are
   * loaded again once the view zooms in far enough.
   */
  private loadRoutes(routeIds: readonly string[]): Observable<SelectedRoutesData> {
    const ids = [...routeIds];
    const tolerance = this.toleranceForView();
    return forkJoin({
      tolerance: of(tolerance),
      stopIds: this.routeApi.getStopIdsForRoutes(ids),
      linesByRoute: this.routeApi.getShapeIdsForRoutes(ids).pipe(
        switchMap(routeShapes => {
          const shapeIds = [...new Set(routeShapes.map(routeShape => routeShape.shapeId))];
          const lines$ = shapeIds.length > 0 ? this.shapeApi.getShapeLines(shapeIds, tolerance) : of([]);
          return lines$.pipe(map(lines => {
            const lineByShape = new Map(lines.map(line => [line.shapeId, line.coordinates] as const));
            const linesByRoute = new Map<string, number[][][]>(ids.map(routeId => [routeId, []]));
            for (const { routeId, shapeId } of routeShapes) {
              const line = lineByShape.get(shapeId);
              if (line) linesByRoute.get(routeId)?.push(line);
            }
            return linesByRoute;
          }));
        })
      )
    });
  }

  /** Half a pixel at the current zoom, in degrees; about a metre when the map is not ready yet. */
  private toleranceForView(): number {
    const view = this.mapService.getMap()?.getView();
    const resolution = view?.getResolution();
    if (!view || resolution === undefined) return MIN_TOLERANCE;
    const metersPerUnit = view.getProjection().getMetersPerUnit() ?? 1;
    return Math.max(resolution * metersPerUnit * 0.5 / METERS_PER_DEGREE_LONGITUDE, MIN_TOLERANCE);
  }

  /** Routes with a trip calling at any stop within the bounds, answered by the backend in one query. */
  private loadRoutesInView(bounds: ViewBounds): Observable<string[]> {
    return this.routeApi.getRouteIdsWithinBounds(bounds.south, bounds.north, bounds.west, bounds.east);
  }
}
