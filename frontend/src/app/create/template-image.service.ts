import { DOCUMENT, inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import Feature from 'ol/Feature';
import type { EventsKey } from 'ol/events';
import { buffer, getHeight, getWidth } from 'ol/extent';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import { unByKey } from 'ol/Observable';
import { fromLonLat, transformExtent } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import View from 'ol/View';

import { GameTemplateControllerService } from '../api/generated';
import type { StationDTO } from '../api/generated';
import { BaseMapLayerService } from '../layer/base-map-layer.service';
import { HILLSHADE_ATTRIBUTION } from '../layer/base-maps';
import { LayerService } from '../layer/layer.service';
import type { MapLayerId } from '../layer/map-layers';
import type { AreaBounds } from './area-bounds';
import { LabelRequest, nearestEdgePoint, placeLabels, Rect } from './label-placement';

/** What goes into the image. */
export interface TemplateImageOptions {
  /** The image's longer side, in pixels. */
  longSide: number;
  outline: boolean;
  /** Shades the map outside the play area. */
  shadeOutside: boolean;
  routes: boolean;
  stations: boolean;
  stationNames: boolean;
  labelSize: LabelSize;
  title: boolean;
  /** Map layers to draw as they are on the map (base map, places, districts). */
  layerIds: readonly MapLayerId[];
}

export type LabelSize = 'small' | 'medium' | 'large';

/** Station names' text size, in layout pixels. */
export const LABEL_FONT_SIZES: Readonly<Record<LabelSize, number>> = { small: 9, medium: 11, large: 14 };

export interface TemplateImageSource {
  templateId: string;
  name: string;
  area: AreaBounds;
}

/**
 * The map is drawn at this many image pixels per layout pixel, and laid out at the image's size divided by it.
 * Lines, markers and text are sized in layout pixels: a larger image shows more map at the same size of them,
 * which leaves more room between crowded stations.
 */
const PIXEL_RATIO = 2;
const MARKER_RADIUS = 5;
/** Room around the play area, as a share of its size. */
const MARGIN = 0.06;
/** The export gives up on a map that has not finished drawing (tiles still loading) by then. */
const RENDER_TIMEOUT_MS = 60_000;
const ACCENT = '#087e8b';

/**
 * Draws a template's play area as a PNG from an off-screen copy of the map, at twice the pixel density. The live
 * map's sources are reused, so what the map has already loaded (routes, places, tiles) is not loaded again.
 * Every station's marker is drawn; their names are placed afterwards so none is left out (see placeLabels).
 */
@Injectable({ providedIn: 'root' })
export class TemplateImageService {
  private readonly document = inject(DOCUMENT);
  private readonly layerService = inject(LayerService);
  private readonly baseMapService = inject(BaseMapLayerService);
  private readonly templateApi = inject(GameTemplateControllerService);

  /** The image's size in pixels for an area, as {@link render} will make it. */
  imageSize(area: AreaBounds, longSide: number): { width: number; height: number } {
    const { cssWidth, cssHeight } = layoutSize(areaExtent(area), longSide);
    return { width: cssWidth * PIXEL_RATIO, height: cssHeight * PIXEL_RATIO };
  }

  async render(source: TemplateImageSource, options: TemplateImageOptions): Promise<Blob> {
    const stations = options.stations
      ? await firstValueFrom(this.templateApi.getTemplateStations(source.templateId))
      : [];
    const extent = areaExtent(source.area);
    const { cssWidth, cssHeight } = layoutSize(extent, options.longSide);
    const pixelRatio = PIXEL_RATIO;

    // Laid out but out of sight; OpenLayers only draws into a container with a size
    const container = this.document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    Object.assign(container.style, {
      position: 'fixed', left: '-100000px', top: '0', width: `${cssWidth}px`, height: `${cssHeight}px`
    });
    this.document.body.append(container);

    const layers = this.layers(source.area, stations, options);
    // Only these report when they finish loading (see LayerService.loadsOnDemand)
    const loads = trackLoads(options.layerIds.filter(layerId => this.layerService.loadsOnDemand(layerId))
      .flatMap(layerId => this.layerService.layersFor(layerId)));
    const map = new OlMap({
      target: container,
      pixelRatio,
      controls: [],
      interactions: [],
      layers,
      view: new View({ projection: 'EPSG:3857' })
    });
    try {
      map.getView().fit(extent, { size: [cssWidth, cssHeight] });
      await renderComplete(map);
      // Layers never shown on the map load their places only now; OpenLayers does not wait for them
      while (loads.pending() > 0) {
        await loads.settled();
        map.render();
        await renderComplete(map);
      }
      const canvas = composeCanvases(map, this.document, cssWidth, cssHeight, pixelRatio);
      const context = canvas.getContext('2d')!;
      const reserved: Rect[] = [];
      if (options.title) reserved.push(drawTitle(context, source.name, pixelRatio));
      const attribution = this.attribution(options.layerIds);
      if (attribution) reserved.push(drawAttribution(context, attribution, pixelRatio));
      if (options.stations && options.stationNames) {
        drawStationNames(context, map, stations, LABEL_FONT_SIZES[options.labelSize], pixelRatio, reserved);
      }
      return await toPng(canvas);
    } finally {
      loads.dispose();
      map.setTarget(undefined);
      container.remove();
    }
  }

  /** What the licences of the image's tiles require it to credit, or nothing when it has no tiles. */
  private attribution(layerIds: readonly MapLayerId[]): string {
    return [
      layerIds.includes('base-map') ? this.baseMapService.attribution() : undefined,
      layerIds.includes('hillshade') ? HILLSHADE_ATTRIBUTION : undefined
    ].filter(text => text !== undefined).join(' · ');
  }

  private layers(area: AreaBounds, stations: readonly StationDTO[], options: TemplateImageOptions): BaseLayer[] {
    const layers: BaseLayer[] = [];
    for (const layerId of options.layerIds) {
      layers.push(...this.layerService.layersFor(layerId).flatMap(copyLayer));
    }
    // The template's routes are what the map draws while the template is open
    if (options.routes) layers.push(...this.layerService.layersFor('routes').flatMap(copyLayer));

    const areaPolygon = boxPolygon(area);
    if (options.shadeOutside) {
      const world = boxPolygon({ west: -180, south: -85, east: 180, north: 85 });
      const shade = new Polygon([world.getLinearRing(0)!.getCoordinates(), areaPolygon.getLinearRing(0)!.getCoordinates()]);
      layers.push(new VectorLayer({
        source: new VectorSource({ features: [new Feature(shade)] }),
        style: new Style({ fill: new Fill({ color: 'rgba(23, 35, 43, 0.35)' }) }),
        zIndex: 900
      }));
    }
    if (options.outline) {
      layers.push(new VectorLayer({
        source: new VectorSource({ features: [new Feature(areaPolygon)] }),
        style: [
          new Style({ stroke: new Stroke({ color: '#ffffff', width: 6 }) }),
          new Style({ stroke: new Stroke({ color: ACCENT, width: 3, lineDash: [10, 6] }) })
        ],
        zIndex: 910
      }));
    }
    if (options.stations) {
      layers.push(new VectorLayer({
        source: new VectorSource({
          features: stations.map(station => {
            const feature = new Feature(new Point(fromLonLat([station.longitude, station.latitude])));
            feature.set('name', station.name);
            return feature;
          })
        }),
        // Every marker, never decluttered; the names are placed on the finished image
        style: STATION_STYLE,
        zIndex: 920
      }));
    }
    return layers;
  }
}

/** The area with a margin, in the map's projection. */
function areaExtent(area: AreaBounds): number[] {
  const extent = transformExtent([area.west, area.south, area.east, area.north], 'EPSG:4326', 'EPSG:3857');
  return buffer(extent, Math.max(getWidth(extent), getHeight(extent)) * MARGIN);
}

/** The layout size with the area's proportions, for an image whose longer side is {@code longSide}. */
function layoutSize(extent: number[], longSide: number): { cssWidth: number; cssHeight: number } {
  const layoutLongSide = Math.round(longSide / PIXEL_RATIO);
  const aspect = getWidth(extent) / getHeight(extent);
  return aspect >= 1
    ? { cssWidth: layoutLongSide, cssHeight: Math.round(layoutLongSide / aspect) }
    : { cssWidth: Math.round(layoutLongSide * aspect), cssHeight: layoutLongSide };
}

function boxPolygon({ west, south, east, north }: AreaBounds): Polygon {
  const ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    .map(position => fromLonLat(position));
  return new Polygon([ring]);
}

/** A layer drawing the same source the same way, for another map; a layer can only be in one map at a time. */
function copyLayer(layer: BaseLayer): BaseLayer[] {
  const shared = {
    opacity: layer.getOpacity(),
    zIndex: layer.getZIndex(),
    minZoom: layer.getMinZoom(),
    maxZoom: layer.getMaxZoom(),
    minResolution: layer.getMinResolution(),
    maxResolution: layer.getMaxResolution()
  };
  if (layer instanceof TileLayer) return [new TileLayer({ ...shared, source: layer.getSource() })];
  if (layer instanceof VectorLayer) {
    return [new VectorLayer({ ...shared, source: layer.getSource(), style: layer.getStyle() })];
  }
  return [];
}

const STATION_STYLE = new Style({
  image: new CircleStyle({
    radius: MARKER_RADIUS, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#17232b', width: 2 })
  })
});

/**
 * Every station's name, placed by {@link placeLabels} so that none is left out: beside its marker where there is
 * room, further out with a line back to it where there is not.
 */
function drawStationNames(context: CanvasRenderingContext2D, map: OlMap, stations: readonly StationDTO[],
                          fontSize: number, pixelRatio: number, reserved: readonly Rect[]): void {
  const size = fontSize * pixelRatio;
  const halo = Math.max(2, fontSize / 3) * pixelRatio;
  context.font = `600 ${size}px system-ui, sans-serif`;
  const requests: LabelRequest[] = stations.flatMap(station => {
    const pixel = map.getPixelFromCoordinate(fromLonLat([station.longitude, station.latitude]));
    if (!pixel) return [];
    return [{
      text: station.name,
      x: pixel[0] * pixelRatio,
      y: pixel[1] * pixelRatio,
      // The halo around the text is part of the label
      width: context.measureText(station.name).width + halo,
      height: size * 1.2 + halo
    }];
  });
  const labels = placeLabels(requests, {
    markerRadius: (MARKER_RADIUS + 1) * pixelRatio,
    gap: 2 * pixelRatio,
    bounds: { x: 0, y: 0, width: context.canvas.width, height: context.canvas.height },
    obstacles: reserved
  });

  // Thin and grey, so they are not taken for routes
  context.lineWidth = 1 * pixelRatio;
  context.strokeStyle = '#52666e';
  for (const label of labels.filter(candidate => candidate.leader)) {
    const end = nearestEdgePoint(label);
    const angle = Math.atan2(end.y - label.anchorY, end.x - label.anchorX);
    const start = MARKER_RADIUS * pixelRatio;
    context.beginPath();
    context.moveTo(label.anchorX + Math.cos(angle) * start, label.anchorY + Math.sin(angle) * start);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  for (const label of labels) {
    const x = label.x + halo / 2;
    const y = label.y + label.height / 2;
    context.lineWidth = halo;
    context.strokeStyle = '#ffffff';
    context.strokeText(label.text, x, y);
    context.fillStyle = '#17232b';
    context.fillText(label.text, x, y);
  }
}

/** Counts the vector sources' loads in progress, so drawing can wait for them. */
function trackLoads(layers: readonly BaseLayer[]): {
  pending: () => number;
  settled: () => Promise<void>;
  /** Stops listening: the sources are the live map's, and outlive the export. */
  dispose: () => void;
} {
  let pending = 0;
  const keys: EventsKey[] = [];
  let wake: (() => void) | null = null;
  const done = () => {
    pending = Math.max(0, pending - 1);
    if (pending === 0) wake?.();
  };
  for (const layer of layers) {
    const source = layer instanceof VectorLayer ? layer.getSource() : null;
    if (!(source instanceof VectorSource)) continue;
    keys.push(
      source.on('featuresloadstart', () => pending++),
      source.on('featuresloadend', done),
      source.on('featuresloaderror', done)
    );
  }
  return {
    pending: () => pending,
    settled: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The places on the map took too long to load')), RENDER_TIMEOUT_MS);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
      if (pending === 0) wake();
    }),
    dispose: () => unByKey(keys)
  };
}

/**
 * Waits until the map has drawn everything it has loaded. OpenLayers redraws on animation frames, which a page
 * in the background does not get; the map is also redrawn on a timer meanwhile, so an export started before
 * switching tabs still finishes.
 */
function renderComplete(map: OlMap): Promise<void> {
  return new Promise((resolve, reject) => {
    // Only when the map has not drawn by itself lately: a large map is slow to draw, and drawing it twice as
    // often would keep the page busy
    let lastDrawn = Date.now();
    const drawn = map.on('postrender', () => lastDrawn = Date.now());
    const redraw = setInterval(() => {
      if (Date.now() - lastDrawn > 500) map.renderSync();
    }, 250);
    const stop = () => {
      clearInterval(redraw);
      unByKey(drawn);
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error('The map took too long to draw'));
    }, RENDER_TIMEOUT_MS);
    map.once('rendercomplete', () => {
      clearTimeout(timer);
      stop();
      resolve();
    });
    map.renderSync();
  });
}

/**
 * One canvas from the layers' canvases, each placed as the map shows it (OpenLayers' own export recipe), scaled
 * from CSS pixels to the image's pixels.
 */
function composeCanvases(map: OlMap, document: Document, cssWidth: number, cssHeight: number, pixelRatio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const layerCanvas of map.getViewport().querySelectorAll<HTMLCanvasElement>('.ol-layer canvas, canvas.ol-layer')) {
    if (layerCanvas.width === 0) continue;
    const parent = layerCanvas.parentElement;
    const opacity = parent?.style.opacity || layerCanvas.style.opacity;
    context.globalAlpha = opacity === '' || opacity === undefined ? 1 : Number(opacity);
    const background = parent?.style.backgroundColor;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const transform = layerCanvas.style.transform.match(/^matrix\(([^(]*)\)$/);
    const [a, b, c, d, e, f] = transform
      ? transform[1].split(',').map(Number)
      : [parseFloat(layerCanvas.style.width) / layerCanvas.width, 0, 0,
        parseFloat(layerCanvas.style.height) / layerCanvas.height, 0, 0];
    context.setTransform(a * pixelRatio, b * pixelRatio, c * pixelRatio, d * pixelRatio, e * pixelRatio, f * pixelRatio);
    context.drawImage(layerCanvas, 0, 0);
  }
  context.globalAlpha = 1;
  context.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** The template's name in a box at the top left; returns the box. */
function drawTitle(context: CanvasRenderingContext2D, title: string, pixelRatio: number): Rect {
  const padding = 12 * pixelRatio;
  context.font = `700 ${26 * pixelRatio}px system-ui, sans-serif`;
  const width = context.measureText(title).width + padding * 2;
  const height = 26 * pixelRatio + padding * 2;
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.fillRect(padding, padding, width, height);
  context.fillStyle = '#17232b';
  context.textBaseline = 'middle';
  context.fillText(title, padding * 2, padding + height / 2);
  return { x: padding, y: padding, width, height };
}

/** Required by the base map's licence wherever its tiles are shown; returns the box. */
function drawAttribution(context: CanvasRenderingContext2D, text: string, pixelRatio: number): Rect {
  const padding = 6 * pixelRatio;
  context.font = `${12 * pixelRatio}px system-ui, sans-serif`;
  const width = context.measureText(text).width + padding * 2;
  const height = 12 * pixelRatio + padding * 2;
  const x = context.canvas.width - width;
  const y = context.canvas.height - height;
  context.fillStyle = 'rgba(255, 255, 255, 0.85)';
  context.fillRect(x, y, width, height);
  context.fillStyle = '#17232b';
  context.textBaseline = 'middle';
  context.fillText(text, x + padding, y + height / 2);
  return { x, y, width, height };
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be made')), 'image/png'));
}
