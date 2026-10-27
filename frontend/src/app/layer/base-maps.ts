import OSM from 'ol/source/OSM';
import type TileSource from 'ol/source/Tile';
import XYZ from 'ol/source/XYZ';

export interface BaseMapDefinition {
  /** Stable id, kept in local storage for the next visit. */
  id: string;
  /** Shown in the Layers tab. */
  label: string;
  /** Required by the tiles' licence wherever they are shown, the exported image included. */
  attribution: string;
  createSource(): TileSource;
}

/** The maps the Layers tab offers under everything else, in menu order; the first is the default. */
export const BASE_MAPS = [
  {
    id: 'streets',
    label: 'Streets',
    attribution: '© OpenStreetMap contributors',
    createSource: () => new OSM()
  },
  {
    id: 'satellite',
    label: 'Satellite',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    createSource: () => new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
      // Without CORS the exported image could not be read back from its canvas
      crossOrigin: 'anonymous'
    })
  }
] as const satisfies readonly BaseMapDefinition[];

export type BaseMapId = typeof BASE_MAPS[number]['id'];

export const DEFAULT_BASE_MAP: BaseMapId = BASE_MAPS[0].id;

export const HILLSHADE_ATTRIBUTION = 'Hillshade © Esri';
