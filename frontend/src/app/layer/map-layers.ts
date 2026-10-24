import type { Type } from '@angular/core';

import type { MapLayerProvider } from './base-layer.service';
import { BaseMapLayerService } from './base-map-layer.service';
import { DistrictLayerService } from './district-layer.service';
import type { OverpassLayerConfig } from './overpass-layer';
import { RouteShapesLayerService } from './route-shapes-layer.service';
import { StopsLayerService } from './stops-layer.service';
import { VehicleLayerService } from './vehicle-layer.service';

export interface MapLayerDefinition {
  /** Stable id, used for visibility state. */
  id: string;
  /** Shown in the Layers menu. */
  label: string;
  /** Visible when the app starts. */
  visible: boolean;
  /** Root-provided service that creates the layer, for layers with their own behavior. */
  provider?: Type<MapLayerProvider>;
  /** Settings for a layer showing one Overpass category. Use this or `provider`, not both. */
  overpass?: OverpassLayerConfig;
  /**
   * The Distances tab can measure to this layer's places. Needs an `overpass` layer that loads every place
   * (loadStrategy 'all'), or "closest" would only mean closest of those in view.
   */
  measurable?: boolean;
}

/**
 * Every layer in the Layers menu, in menu order. Layers are also added to the map in this order,
 * which decides stacking between layers with the same z-index.
 *
 * To add a layer for an Overpass category, add one entry with its `overpass` settings. Layers without
 * `provider` or `overpass` (Measurements) are added later through `LayerService.addMeasureLayer`.
 */
export const MAP_LAYERS = [
  { id: 'base-map', label: 'Base map', visible: true, provider: BaseMapLayerService },
  { id: 'districts', label: 'Districts', visible: false, provider: DistrictLayerService },
  { id: 'routes', label: 'Routes', visible: true, provider: RouteShapesLayerService },
  { id: 'stops', label: 'Stops', visible: false, provider: StopsLayerService },
  { id: 'vehicles', label: 'Vehicles', visible: false, provider: VehicleLayerService },
  { id: 'measurements', label: 'Measurements', visible: true },
  { id: 'airports', label: 'Airports', visible: false, measurable: true,
    overpass: { category: 'COMMERCIAL_AIRPORT', color: '#d9480f', style: { kind: 'point' } } },
  { id: 'aquariums', label: 'Aquariums', visible: false, measurable: true,
    overpass: { category: 'AQUARIUM', color: '#0f88d9', style: { kind: 'point' } } },
  { id: 'parks', label: 'Parks', visible: false, measurable: true,
    overpass: { category: 'PARK', color: '#2e734e', style: { kind: 'point' } } },
  { id: 'rail_station', label: 'Rail Stations', visible: false, measurable: true,
    overpass: { category: 'RAIL_STATION', color: '#7fb7cf', style: { kind: 'point' } } },
  { id: 'mountains', label: 'Mountains', visible: false, measurable: true,
    overpass: { category: 'MOUNTAIN', color: '#636764', style: { kind: 'point' } } },
  // Areas stored as a center point only: a distance to the center would be misleading
  { id: 'admin_division_1', label: 'Admin Division 1', visible: false,
    overpass: { category: 'ADMIN_DIVISION_1', color: '#db9868', style: { kind: 'point' } } },
  { id: 'admin_division_2', label: 'Admin Division 2', visible: false,
    overpass: { category: 'ADMIN_DIVISION_2', color: '#d67d3d', style: { kind: 'point' } } },
  { id: 'admin_division_4', label: 'Admin Division 4', visible: false,
    overpass: { category: 'ADMIN_DIVISION_4', color: '#d66310', style: { kind: 'point' } } },
  // A few hundred line segments: loaded once, in full detail
  { id: 'high_speed_rail', label: 'High-Speed Rail', visible: false, measurable: true,
    overpass: {
      category: 'HIGH_SPEED_RAIL_LINE', color: '#c2185b', style: { kind: 'line', width: 3, casing: true },
      includeGeometry: true, zIndex: 55
    } },
  // ~80k line segments and ~50k lakes: loaded only where the map is viewed, so they cannot answer
  // "closest" reliably. Lakes imported without geometry fall back to dots.
  { id: 'coastline', label: 'Coastline', visible: false,
    overpass: {
      category: 'COASTLINE', color: '#0b4f8a', style: { kind: 'line', width: 2 },
      loadStrategy: 'bbox', includeGeometry: true, simplifyGeometry: true, minZoom: 10, zIndex: 52
    } },
  { id: 'bodies_of_water', label: 'Bodies of Water', visible: false,
    overpass: {
      category: 'BODY_OF_WATER', color: '#1565c0', style: { kind: 'area' },
      loadStrategy: 'bbox', includeGeometry: true, simplifyGeometry: true, minZoom: 9, zIndex: 51
    } },
  { id: 'zoos', label: 'Zoos', visible: false, measurable: true,
    overpass: { category: 'ZOO', color: '#8d6e2f', style: { kind: 'point' } } },
  { id: 'golf_courses', label: 'Golf Courses', visible: false, measurable: true,
    overpass: { category: 'GOLF_COURSE', color: '#5f8f1f', style: { kind: 'point' } } },
  { id: 'museums', label: 'Museums', visible: false, measurable: true,
    overpass: { category: 'MUSEUM', color: '#7b3fa0', style: { kind: 'point' } } },
  { id: 'movie_theatres', label: 'Movie Theatres', visible: false, measurable: true,
    overpass: { category: 'MOVIE_THEATRE', color: '#b8336a', style: { kind: 'point' } } },
  { id: 'hospitals', label: 'Hospitals', visible: false, measurable: true,
    overpass: { category: 'HOSPITAL', color: '#c62828', style: { kind: 'point' } } },
  { id: 'libraries', label: 'Libraries', visible: false, measurable: true,
    overpass: { category: 'LIBRARY', color: '#6d4c41', style: { kind: 'point' } } },
  { id: 'foreign_consulates', label: 'Foreign Consulates', visible: false, measurable: true,
    overpass: { category: 'FOREIGN_CONSULATE', color: '#37474f', style: { kind: 'point' } } },
] as const satisfies readonly MapLayerDefinition[];

export type MapLayerId = typeof MAP_LAYERS[number]['id'];
