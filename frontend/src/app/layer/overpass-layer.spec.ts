import { LineString, Polygon } from 'ol/geom';
import type VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { get as getProjection } from 'ol/proj';
import type VectorSource from 'ol/source/Vector';
import View from 'ol/View';
import { of } from 'rxjs';

import type { OverpassService } from '../api/generated';
import { MAP_LAYERS } from './map-layers';
import { OverpassLayer } from './overpass-layer';

describe('OverpassLayer', () => {
  /** One coastline way, with more vertices the finer the requested tolerance. */
  function page(tolerance: number | undefined) {
    const points = tolerance && tolerance > 0.0001 ? 2 : 5;
    const coordinates = Array.from({ length: points }, (_, i) => [12 + i * 0.01, 57.7]);
    return of({
      content: [{ osmType: 'WAY', osmId: 1, longitude: 12, latitude: 57.7, geometry: { type: 'LineString', coordinates } }],
      page: 0, size: 1000, totalElements: 1, totalPages: 1
    });
  }

  it('requests simplified shapes and swaps in finer ones after zooming in', () => {
    const searchPlaces = vi.fn((...args: unknown[]) => page(args[8] as number | undefined));

    const view = new View({ center: [1_336_000, 7_900_000], resolution: 100 });
    let onMoveEnd = () => {};
    const map = {
      addLayer: vi.fn(), getView: () => view,
      on: (type: string, listener: () => void) => { if (type === 'moveend') onMoveEnd = listener; }
    } as unknown as OlMap;
    const coastline = MAP_LAYERS.find(definition => definition.id === 'coastline')!.overpass;
    const overpassLayer = new OverpassLayer({ searchPlaces } as unknown as OverpassService, coastline);
    const layer = overpassLayer.load(map)[0] as VectorLayer<VectorSource>;
    const source = layer.getSource()!;
    const projection = getProjection('EPSG:3857')!;
    const extent = [1_330_000, 7_890_000, 1_340_000, 7_910_000];

    source.loadFeatures(extent, 100, projection);
    const coarseTolerance = searchPlaces.mock.calls[0][8] as number;
    expect(coarseTolerance).toBeCloseTo(100 * 0.5 / 111_319.49);
    expect(searchPlaces.mock.calls[0][7]).toBe(true);   // includeGeometry, so the backend matches by shape
    const feature = source.getFeatureById('WAY/1')!;
    expect((feature.getGeometry() as LineString).getCoordinates()).toHaveLength(2);

    // Same area, closer zoom: OpenLayers would skip it without the reload
    view.setResolution(10);
    const revision = source.getRevision();
    onMoveEnd();
    expect(source.getRevision()).toBeGreaterThan(revision);   // makes the renderer call the loader again
    source.loadFeatures(extent, 10, projection);
    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(source.getFeatureById('WAY/1')).toBe(feature);
    expect((feature.getGeometry() as LineString).getCoordinates()).toHaveLength(5);
  });

  it('loads Voronoi cells from their own endpoint and draws them as polygons', () => {
    const square = [[[12, 57], [13, 57], [13, 58], [12, 58], [12, 57]]];
    const searchVoronoiCells = vi.fn(() => of({
      content: [{ osmType: 'NODE', osmId: 2, longitude: 12.5, latitude: 57.5, geometry: { type: 'Polygon', coordinates: square } }],
      page: 0, size: 1000, totalElements: 1, totalPages: 1
    }));
    const searchPlaces = vi.fn();

    const view = new View({ center: [1_336_000, 7_900_000], resolution: 100 });
    const map = { addLayer: vi.fn(), getView: () => view, on: vi.fn() } as unknown as OlMap;
    const cells = MAP_LAYERS.find(definition => definition.id === 'airport_regions')!.overpass;
    const overpassLayer = new OverpassLayer({ searchPlaces, searchVoronoiCells } as unknown as OverpassService, cells);
    const source = (overpassLayer.load(map)[0] as VectorLayer<VectorSource>).getSource()!;

    source.loadFeatures([1_330_000, 7_890_000, 1_340_000, 7_910_000], 100, getProjection('EPSG:3857')!);

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(searchVoronoiCells).toHaveBeenCalledOnce();
    expect((searchVoronoiCells.mock.calls[0] as unknown[])[0]).toBe('COMMERCIAL_AIRPORT');
    expect(source.getFeatureById('NODE/2')!.getGeometry()).toBeInstanceOf(Polygon);
  });
});
