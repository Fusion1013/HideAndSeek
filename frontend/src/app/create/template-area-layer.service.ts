import { inject, Injectable, signal } from '@angular/core';
import type { Coordinate } from 'ol/coordinate';
import { getHeight, getWidth } from 'ol/extent';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Draw, { DrawEvent } from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import type OlMap from 'ol/Map';
import { transformExtent } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';

import { MapService } from '../map/map.service';
import type { AreaBounds } from './area-bounds';

/** Above the routes and stops, below the measuring shapes. */
const AREA_Z_INDEX = 900;

/** "Use map view" leaves this share of the view around the area, so its edges stay visible. */
const VIEW_MARGIN = 0.1;

const AREA_STYLE = [
  new Style({ stroke: new Stroke({ color: '#ffffff', width: 6 }) }),
  new Style({
    stroke: new Stroke({ color: '#087e8b', width: 3, lineDash: [10, 6] }),
    fill: new Fill({ color: 'rgba(8, 126, 139, 0.08)' })
  })
];

/**
 * The play area on the map while a template is being edited: shows it, and draws a new one as a box from one
 * corner to the opposite one. Only on the map while Create mode is open.
 */
@Injectable({ providedIn: 'root' })
export class TemplateAreaLayerService {
  private readonly mapService = inject(MapService);
  private readonly source = new VectorSource<Feature<Polygon>>();
  private readonly layer = new VectorLayer({ source: this.source, style: AREA_STYLE, zIndex: AREA_Z_INDEX });
  private map: OlMap | null = null;
  private draw: Draw | null = null;
  private square = true;
  private onDrawn: ((bounds: AreaBounds) => void) | null = null;

  /** True between starting to draw and the second corner (or cancelling). */
  readonly drawing = signal(false);

  /** Puts the layer on the map; false while the map is not ready yet. */
  attach(): boolean {
    const map = this.mapService.getMap();
    if (!map) return false;
    if (this.map === map) return true;
    this.detach();

    this.map = map;
    map.addLayer(this.layer);
    this.draw = new Draw({
      type: 'Circle',
      geometryFunction: (coordinates, geometry) => this.boxGeometry(coordinates as Coordinate[], geometry as Polygon),
      style: AREA_STYLE
    });
    this.draw.setActive(false);
    this.draw.on('drawend', this.handleDrawEnd);
    map.addInteraction(this.draw);
    return true;
  }

  /** Takes the layer and the drawing tool off the map, as Create mode closes. */
  detach(): void {
    this.cancelDrawing();
    if (this.map) {
      this.map.removeLayer(this.layer);
      if (this.draw) this.map.removeInteraction(this.draw);
    }
    this.draw?.un('drawend', this.handleDrawEnd);
    this.draw = null;
    this.map = null;
    this.source.clear();
  }

  /** Shows the area, or none. */
  show(bounds: AreaBounds | null): void {
    this.source.clear();
    if (!bounds || !this.map) return;
    const projection = this.map.getView().getProjection();
    const [minX, minY, maxX, maxY] = transformExtent(
      [bounds.west, bounds.south, bounds.east, bounds.north], 'EPSG:4326', projection);
    this.source.addFeature(new Feature(new Polygon([[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]])));
  }

  /** Waits for two clicks on the map, one corner and then the opposite one, and reports the box. */
  startDrawing(square: boolean, onDrawn: (bounds: AreaBounds) => void): void {
    if (!this.draw) return;
    this.square = square;
    this.onDrawn = onDrawn;
    this.draw.setActive(true);
    this.drawing.set(true);
  }

  cancelDrawing(): void {
    this.draw?.abortDrawing();
    this.draw?.setActive(false);
    this.onDrawn = null;
    this.drawing.set(false);
  }

  /** A box in the middle of the current view, leaving a margin; square when asked for. */
  boundsFromView(square: boolean): AreaBounds | null {
    const map = this.map;
    const size = map?.getSize();
    if (!map || !size) return null;

    const view = map.getView();
    const extent = view.calculateExtent(size);
    let width = getWidth(extent) * (1 - 2 * VIEW_MARGIN);
    let height = getHeight(extent) * (1 - 2 * VIEW_MARGIN);
    if (square) width = height = Math.min(width, height);
    const centerX = (extent[0] + extent[2]) / 2;
    const centerY = (extent[1] + extent[3]) / 2;
    return this.toBounds([centerX - width / 2, centerY - height / 2, centerX + width / 2, centerY + height / 2]);
  }

  /** Moves the view so the whole area is visible. */
  fitView(bounds: AreaBounds): void {
    const map = this.map;
    if (!map) return;
    const extent = transformExtent([bounds.west, bounds.south, bounds.east, bounds.north], 'EPSG:4326',
      map.getView().getProjection());
    map.getView().fit(extent, { padding: [48, 48, 48, 48], duration: 300 });
  }

  /**
   * The box from the first corner to the pointer. Mercator keeps small shapes' proportions, so a square on the
   * map is also close to square on the ground.
   */
  private boxGeometry([start, end]: Coordinate[], geometry: Polygon | undefined): Polygon {
    let width = end[0] - start[0];
    let height = end[1] - start[1];
    if (this.square) {
      const side = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * side;
      height = Math.sign(height || 1) * side;
    }
    const ring = [
      start,
      [start[0] + width, start[1]],
      [start[0] + width, start[1] + height],
      [start[0], start[1] + height],
      start
    ];
    const box = geometry ?? new Polygon([ring]);
    box.setCoordinates([ring]);
    return box;
  }

  private readonly handleDrawEnd = (event: DrawEvent): void => {
    const geometry = event.feature.getGeometry();
    const onDrawn = this.onDrawn;
    this.onDrawn = null;
    this.drawing.set(false);
    // Stays active until this click is fully handled: two quick corner clicks also count as a double click,
    // and the active drawing tool keeps that from zooming the map
    const draw = this.draw;
    setTimeout(() => {
      if (!this.drawing()) draw?.setActive(false);
    });
    if (geometry && onDrawn) {
      const bounds = this.toBounds(geometry.getExtent());
      if (bounds) onDrawn(bounds);
    }
  };

  private toBounds(extent: number[]): AreaBounds | null {
    if (!this.map) return null;
    const [west, south, east, north] = transformExtent(extent, this.map.getView().getProjection(), 'EPSG:4326');
    return west < east && south < north ? { west, south, east, north } : null;
  }
}
