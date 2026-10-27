import { EMPTY, Observable, expand, reduce } from 'rxjs';
import Feature from 'ol/Feature';
import { Geometry, Point } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';
import { Extent } from 'ol/extent';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { Projection, fromLonLat, transformExtent } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { all as allStrategy, bbox as bboxStrategy } from 'ol/loadingstrategy';
import { unByKey } from 'ol/Observable';

import { BaseLayerService } from './base-layer.service';
import { createOverpassStyle } from './overpass-styles';
import type { OverpassStyle } from './overpass-styles';
import { OverpassLocationDTO, OverpassLocationPage, OverpassService } from '../api/generated';

export type LoadStrategy = 'all' | 'bbox';

/** What each feature's geometry is: the place itself, or the region where it is the closest of its category. */
export type OverpassLayerSource = 'places' | 'voronoi-cells';

/** Everything that distinguishes one Overpass category's layer from another. */
export interface OverpassLayerConfig {
  category: OverpassLocationDTO.CategoryEnum;
  color: string;
  style: OverpassStyle;
  /**
   * 'places' (default): the places themselves. 'voronoi-cells': each place's Voronoi cell, the area where it is
   * the closest place of the category. Cells always come with their geometry, so set `includeGeometry` too.
   * Only categories stored as points on the backend have cells.
   */
  source?: OverpassLayerSource;
  /**
   * 'all' (default): load the whole category once (good for small categories like airports).
   * 'bbox': load only what is in view, fetching more as the user pans and zooms.
   */
  loadStrategy?: LoadStrategy;
  /**
   * Request the stored geometry (lines, polygons) and render it instead of a point. With 'bbox', places
   * are then matched by their shape, so lines and areas that only cross the view are loaded too.
   * Only categories imported with OutMode.GEOM on the backend have one.
   */
  includeGeometry?: boolean;
  /**
   * With 'bbox' and geometry, ask the backend for shapes simplified to the current zoom, and reload them in
   * more detail when zooming in. Not used with 'all', which loads once at whatever zoom the map is at.
   */
  simplifyGeometry?: boolean;
  /** The layer is not rendered, and so not loaded, below this zoom. Useful for dense categories. */
  minZoom?: number;
  /** Defaults to 60, above the transit layers. */
  zIndex?: number;
}

interface LonLatBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Map units per degree of longitude in EPSG:3857, which is linear in longitude. */
const MAP_UNITS_PER_DEGREE = 111_319.49;

/** Shapes are simplified to this many screen pixels: below one pixel the difference is invisible. */
const SIMPLIFY_PIXELS = 0.5;

const PAGE_SIZE = 1000;

const geoJson = new GeoJSON();

/** A map layer showing the places of one Overpass category, as configured in the layer registry. */
export class OverpassLayer extends BaseLayerService {
  readonly color: string;
  readonly loadStrategy: LoadStrategy;

  private readonly source: VectorSource<Feature<Geometry>>;
  private readonly simplifies: boolean;

  /** Extents loaded with simplified shapes, and the finest tolerance among them. */
  private simplifiedExtents: Extent[] = [];
  private loadedTolerance = Infinity;

  constructor(private readonly overpassApi: OverpassService, private readonly config: OverpassLayerConfig) {
    super();
    this.color = config.color;
    this.loadStrategy = config.loadStrategy ?? 'all';
    this.simplifies = !!config.simplifyGeometry && !!config.includeGeometry && this.loadStrategy === 'bbox';
    this.source = this.createSource();
  }

  /** The places loaded so far. Each feature carries its {@link OverpassLocationDTO} as `place`. */
  public getFeatures(): Feature<Geometry>[] {
    return this.source.getFeatures();
  }

  /** Calls the listener whenever features are added or removed. Returns a function that unsubscribes. */
  public onFeaturesChange(listener: () => void): () => void {
    const key = this.source.on('change', listener);
    return () => unByKey(key);
  }

  protected override createLayers(map: OlMap) {
    if (this.simplifies) map.on('moveend', () => this.reloadIfZoomedIn(map));

    return [new VectorLayer({
      source: this.source,
      style: createOverpassStyle(this.config.style, this.config.color),
      zIndex: this.config.zIndex ?? 60,
      minZoom: this.config.minZoom
    })];
  }

  private createSource(): VectorSource<Feature<Geometry>> {
    const source: VectorSource<Feature<Geometry>> = new VectorSource<Feature<Geometry>>({
      strategy: this.loadStrategy === 'bbox' ? bboxStrategy : allStrategy,
      loader: (extent, resolution, projection, success, failure) => {
        const bounds = this.loadStrategy === 'bbox'
          ? toLonLatBounds(extent, projection)
          : undefined;
        const tolerance = this.simplifies ? toleranceFor(resolution, projection) : 0;

        this.fetchPlaces(bounds, tolerance).subscribe({
          next: places => {
            const features = places
              .map(place => toFeature(place, projection))
              .filter(feature => feature !== undefined);
            if (tolerance > 0) {
              features.forEach(feature => feature.set('tolerance', tolerance));
              this.refineExisting(features, tolerance);
              this.simplifiedExtents.push(extent);
              this.loadedTolerance = Math.min(this.loadedTolerance, tolerance);
            }
            source.addFeatures(features);   // features with an id that already exists are skipped
            success?.(features);
          },
          error: error => {
            console.error(`Failed to load ${this.config.category} places`, error);
            source.removeLoadedExtent(extent);   // lets OpenLayers retry this extent later
            failure?.();
          }
        });
      }
    });
    return source;
  }

  /** The only method that touches the generated client. Adjust if its signatures differ. */
  private fetchPage(page: number, bounds: LonLatBounds | undefined, tolerance: number): Observable<OverpassLocationPage> {
    if (this.config.source === 'voronoi-cells') {
      return this.overpassApi.searchVoronoiCells(
        this.config.category,
        bounds?.south,
        bounds?.west,
        bounds?.north,
        bounds?.east,
        page,
        PAGE_SIZE,
        tolerance > 0 ? tolerance : undefined
      );
    }
    return this.overpassApi.searchPlaces(
      this.config.category,
      bounds?.south,
      bounds?.west,
      bounds?.north,
      bounds?.east,
      page,
      PAGE_SIZE,
      !!this.config.includeGeometry,
      tolerance > 0 ? tolerance : undefined
    );
  }

  /** Fetches every page and concatenates the results. */
  private fetchPlaces(bounds: LonLatBounds | undefined, tolerance: number): Observable<OverpassLocationDTO[]> {
    return this.fetchPage(0, bounds, tolerance).pipe(
      expand(response => {
        const page = response.page ?? 0;
        const totalPages = response.totalPages ?? 0;
        return page + 1 < totalPages ? this.fetchPage(page + 1, bounds, tolerance) : EMPTY;
      }),
      reduce((places: OverpassLocationDTO[], response) => places.concat(response.content ?? []), [])
    );
  }

  /** Swaps in the more detailed shape for places that were loaded earlier at a coarser zoom. */
  private refineExisting(features: readonly Feature<Geometry>[], tolerance: number): void {
    for (const feature of features) {
      const id = feature.getId();
      const existing = id === undefined ? null : this.source.getFeatureById(id);
      if (existing && (existing.get('tolerance') ?? Infinity) > tolerance) {
        existing.setGeometry(feature.getGeometry());
        existing.set('tolerance', tolerance);
      }
    }
  }

  /**
   * OpenLayers does not reload an area it has loaded before, even at a closer zoom. Once the view needs
   * more detail than anything loaded so far, forget the simplified extents so the view is fetched again.
   */
  private reloadIfZoomedIn(map: OlMap): void {
    const view = map.getView();
    const resolution = view.getResolution();
    if (resolution === undefined || this.simplifiedExtents.length === 0) return;
    if (toleranceFor(resolution, view.getProjection()) * 2 > this.loadedTolerance) return;

    this.simplifiedExtents.forEach(extent => this.source.removeLoadedExtent(extent));
    this.simplifiedExtents = [];
    this.loadedTolerance = Infinity;
    this.source.changed();   // a re-render alone is skipped while nothing changed, so no load would happen
  }
}

function toFeature(place: OverpassLocationDTO, projection: Projection): Feature<Geometry> | undefined {
  if (!place.longitude || !place.latitude) {
    return undefined;
  }

  const geometry = place.geometry
    ? geoJson.readGeometry(place.geometry, {
        dataProjection: 'EPSG:4326',
        featureProjection: projection
      })
    : new Point(fromLonLat([place.longitude, place.latitude], projection));

  const feature = new Feature<Geometry>({ geometry, place });
  feature.setId(`${place.osmType}/${place.osmId}`);
  return feature;
}

/** Simplification tolerance in degrees for a map resolution (map units per pixel). */
function toleranceFor(resolution: number, projection: Projection): number {
  const metersPerUnit = projection.getMetersPerUnit() ?? 1;
  return resolution * metersPerUnit * SIMPLIFY_PIXELS / MAP_UNITS_PER_DEGREE;
}

function toLonLatBounds(extent: Extent, projection: Projection): LonLatBounds {
  const [west, south, east, north] = transformExtent(extent, projection, 'EPSG:4326');
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    south: clamp(south, -90, 90),
    west: clamp(west, -180, 180),
    north: clamp(north, -90, 90),
    east: clamp(east, -180, 180)
  };
}
