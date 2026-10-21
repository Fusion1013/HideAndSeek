import { inject, Injectable } from '@angular/core';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import type BaseLayer from 'ol/layer/Base';
import VectorLayer from 'ol/layer/Vector';
import OlMap from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import { BaseMapLayerService } from './base-map-layer.service';
import { DistrictLayerService } from './district-layer.service';
import { StopsLayerService } from './stops-layer.service';
import { RouteShapesLayerService } from './route-shapes-layer.service';
import { VehicleLayerService } from './vehicle-layer.service';
import type { AgencyRouteEntity, ShapeEntity } from '../api/generated';
import { AirportLayerService } from './airport-layer.service';
import { AquariumLayerService } from './aquarium-layer.service';
import { ParkLayerService } from './park-layer.service';
import { RailStationLayerService } from './rail-station-layer.service';
import { MountainLayerService } from './mountain-layer.service';
import { AdminDivision1Service } from './admin-division-1-layer.service';
import { AdminDivision2Service } from './admin-division-2.service';
import { AdminDivision4Service } from './admin-division-4.service';

export type MapLayerId = 'base-map' | 'districts' | 'routes' | 'stops' | 'vehicles' | 'measurements' | 'airports' | 'aquariums' | 'parks' | 'rail_station' | 'mountains' | 'admin_division_1' | 'admin_division_2' | 'admin_division_4';

@Injectable({
  providedIn: 'root',
})
export class LayerService {
  private readonly baseMapLayer = inject(BaseMapLayerService);
  private readonly stopsLayer = inject(StopsLayerService);
  private readonly vehicleLayer = inject(VehicleLayerService);
  private readonly districtLayer = inject(DistrictLayerService);
  private readonly routeShapesLayer = inject(RouteShapesLayerService);
  private readonly airportLayer = inject(AirportLayerService);
  private readonly aquariumLayer = inject(AquariumLayerService);
  private readonly parksLayer = inject(ParkLayerService);
  private readonly mountainsLayer = inject(MountainLayerService);
  private readonly adminDivision1 = inject(AdminDivision1Service);
  private readonly adminDivision2 = inject(AdminDivision2Service);
  private readonly adminDivision4 = inject(AdminDivision4Service);
  private readonly railStationLayerService = inject(RailStationLayerService);
  private readonly registeredLayers = new Map<MapLayerId, BaseLayer[]>();
  private readonly layerVisibility = new Map<MapLayerId, boolean>();
  private readonly defaultLayerVisibility: Record<MapLayerId, boolean> = {
    'base-map': true,
    districts: false,
    routes: true,
    stops: false,
    vehicles: false,
    measurements: true,
    airports: false,
    aquariums: false,
    parks: false,
    rail_station: false,
    mountains: false,
    admin_division_1: false,
    admin_division_2: false,
    admin_division_4: false,
  };

  public async loadLayers(map: OlMap): Promise<void> {
    this.registerLayers('base-map', this.baseMapLayer.load(map));
    this.registerLayers('districts', this.districtLayer.load(map));
    this.registerLayers('routes', this.routeShapesLayer.load(map));
    this.registerLayers('stops', this.stopsLayer.load(map));
    this.registerLayers('vehicles', this.vehicleLayer.load(map));
    this.registerLayers('airports', this.airportLayer.load(map));
    this.registerLayers('aquariums', this.aquariumLayer.load(map));
    this.registerLayers('parks', this.parksLayer.load(map));
    this.registerLayers('rail_station', this.railStationLayerService.load(map));
    this.registerLayers('mountains', this.mountainsLayer.load(map));
    this.registerLayers('admin_division_1', this.adminDivision1.load(map));
    this.registerLayers('admin_division_2', this.adminDivision2.load(map));
    this.registerLayers('admin_division_4', this.adminDivision4.load(map));

  }

  public refreshVehiclePositions(map: OlMap): Promise<void> {
    return this.vehicleLayer.refreshVehiclePositions(map);
  }

  public setRouteShapes(map: OlMap, shapesByRoute: ReadonlyMap<string, readonly ShapeEntity[][]>): void {
    this.routeShapesLayer.setRouteShapes(map, shapesByRoute);
  }

  public setVehicleRouteShape(shapes: readonly ShapeEntity[] | null): void {
    this.routeShapesLayer.setVehicleRouteShape(shapes);
  }

  public setVehicleRouteMetadata(routes: readonly AgencyRouteEntity[]): void {
    this.vehicleLayer.setRouteMetadata(routes);
  }

  public setVehicleTripRouteIds(routeIdsByTripId: ReadonlyMap<string, string>): void {
    this.vehicleLayer.setTripRouteIds(routeIdsByTripId);
  }

  public setHighlightedVehicleRouteIds(routeIds: readonly string[]): void {
    this.vehicleLayer.setHighlightedRouteIds(routeIds);
  }

  public setVisibleStopIds(stopIds: readonly string[] | null): void {
    this.stopsLayer.setVisibleStopIds(stopIds);
  }

  public setLayerVisibility(layerId: MapLayerId, visible: boolean): void {
    this.layerVisibility.set(layerId, visible);
    this.registeredLayers.get(layerId)?.forEach(layer => layer.setVisible(visible));
  }

  public getLayerVisibility(layerId: MapLayerId): boolean {
    return this.layerVisibility.get(layerId) ?? this.defaultLayerVisibility[layerId];
  }

  public addMeasureLayer(map: OlMap, layer: VectorLayer<VectorSource<Feature<Geometry>>>): void {
    layer.setVisible(this.getLayerVisibility('measurements'));
    const measurementLayers = this.registeredLayers.get('measurements') ?? [];
    measurementLayers.push(layer);
    this.registeredLayers.set('measurements', measurementLayers);
    map.addLayer(layer);
  }

  private registerLayers(layerId: MapLayerId, layers: BaseLayer[]): void {
    const visible = this.getLayerVisibility(layerId);
    layers.forEach(layer => layer.setVisible(visible));
    this.registeredLayers.set(layerId, layers);
  }
}