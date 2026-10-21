import { inject } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
import Feature, { FeatureLike } from 'ol/Feature';
import { Geometry, Point } from 'ol/geom';
import { Extent } from 'ol/extent';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { Projection, fromLonLat, transformExtent } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { all as allStrategy, bbox as bboxStrategy } from 'ol/loadingstrategy';
import { Style } from 'ol/style';

import { BaseLayerService } from './base-layer.service';
import { OverpassLocationDTO, OverpassLocationPage, OverpassService } from '../api/generated';

export type LoadStrategy = 'all' | 'bbox';

interface LonLatBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export abstract class BaseOverpassService extends BaseLayerService {
  private static readonly PAGE_SIZE = 1000;

  protected readonly overpassApi = inject(OverpassService);

  /** Category to load, as defined by the backend's PlaceCategory enum. */
  protected abstract readonly category: 'COMMERCIAL_AIRPORT' | 'HIGH_SPEED_RAIL_LINE' | 'RAIL_STATION' | 'ADMIN_DIVISION_1' | 'ADMIN_DIVISION_2' | 'ADMIN_DIVISION_4' | 'BODY_OF_WATER' | 'COASTLINE' | 'MOUNTAIN' | 'PARK' | 'ZOO' | 'AQUARIUM' | 'GOLF_COURSE' | 'MUSEUM' | 'MOVIE_THEATRE' | 'HOSPITAL' | 'LIBRARY' | 'FOREIGN_CONSULATE' | 'OTHER';

  /** Style for one place. Return a cached Style where possible. */
  protected abstract getStyle(feature: FeatureLike, resolution: number): Style | Style[] | void;

  /**
   * 'bbox': load only what is in view, fetching more as the user pans and zooms.
   * 'all':  load the whole category once (good for small categories like airports).
   */
  protected readonly loadStrategy: LoadStrategy = 'bbox';

  protected readonly layerZIndex: number = 50;

  /** Layers are not rendered, and so not loaded, below this zoom. Useful for dense categories. */
  protected readonly minZoom: number | undefined = undefined;

  // Built lazily: subclass fields (category, loadStrategy, ...) are not assigned
  // yet while this base class is being constructed.
  private _source?: VectorSource<Feature<Geometry>>;

  protected get source(): VectorSource<Feature<Geometry>> {
    return (this._source ??= this.createSource());
  }

  protected override createLayers(_map: OlMap) {
    return [new VectorLayer({
      source: this.source,
      style: (feature, resolution) => this.getStyle(feature, resolution),
      zIndex: this.layerZIndex,
      minZoom: this.minZoom
    })];
  }

  private createSource(): VectorSource<Feature<Geometry>> {
    const source: VectorSource<Feature<Geometry>> = new VectorSource<Feature<Geometry>>({
      strategy: this.loadStrategy === 'bbox' ? bboxStrategy : allStrategy,
      loader: (extent, _resolution, projection, success, failure) => {
        const bounds = this.loadStrategy === 'bbox'
          ? this.toLonLatBounds(extent, projection)
          : undefined;

        this.fetchPlaces(bounds).subscribe({
          next: places => {
            const features = places.map(place => this.toFeature(place, projection)).filter(obj => obj !== undefined);
            source.addFeatures(features);   // features with an id that already exists are skipped
            success?.(features);
          },
          error: error => {
            console.error(`Failed to load ${this.category} places`, error);
            source.removeLoadedExtent(extent);   // lets OpenLayers retry this extent later
            failure?.();
          }
        });
      }
    });
    return source;
  }

  /** The only method that touches the generated client. Adjust if its signature differs. */
  protected fetchPage(page: number, bounds?: LonLatBounds): Observable<OverpassLocationPage> {
    return this.overpassApi.searchPlaces(
      this.category,
      bounds?.south,
      bounds?.west,
      bounds?.north,
      bounds?.east,
      page,
      BaseOverpassService.PAGE_SIZE
    );
  }

  /** Fetches every page and concatenates the results. */
private fetchPlaces(bounds?: LonLatBounds): Observable<OverpassLocationDTO[]> {
  return this.fetchPage(0, bounds).pipe(
    expand(response => {
      const page = response.page ?? 0;
      const totalPages = response.totalPages ?? 0;
      return page + 1 < totalPages ? this.fetchPage(page + 1, bounds) : EMPTY;
    }),
    reduce((places: OverpassLocationDTO[], response) => places.concat(response.content ?? []), [])
  );
}

  /** Override to build different geometry or extra properties. */
  protected toFeature(place: OverpassLocationDTO, projection: Projection): Feature<Geometry> | undefined {
    console.log('ToFeature', [place])
    if (!place.longitude || !place.latitude) {
        return undefined;
    }

    const feature = new Feature<Geometry>({
      geometry: new Point(fromLonLat([place.longitude, place.latitude], projection)),
      place
    });
    feature.setId(`${place.osmType}/${place.osmId}`);
    return feature;
  }

  private toLonLatBounds(extent: Extent, projection: Projection): LonLatBounds {
    const [west, south, east, north] = transformExtent(extent, projection, 'EPSG:4326');
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    return {
      south: clamp(south, -90, 90),
      west: clamp(west, -180, 180),
      north: clamp(north, -90, 90),
      east: clamp(east, -180, 180)
    };
  }
}