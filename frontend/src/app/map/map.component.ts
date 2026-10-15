import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { MapService } from './map.service';
import { LayerService } from '../layer/layer.service';
import { ShapeService } from '../shape/shape.service';
import { TransitService as TransitDataService } from '../transit/transit.service';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapComponent implements OnInit {

  private readonly mapService = inject(MapService);
  private readonly layerService = inject(LayerService);
  private readonly shapeService = inject(ShapeService);
  private readonly transitService = inject(TransitDataService);

  @ViewChild('mapElement', { static: true })
  mapElement!: ElementRef<HTMLDivElement>;

  readonly lines = signal<string[]>([]);
  readonly selectedLines = signal<string[]>([]);
  readonly loadError = signal(false);

  readonly showLabels = signal(true);
  readonly drawMode = signal<'line' | 'circle' | null>(null);
  readonly controlsOpen = signal(false);
  readonly activeControlsMenu = signal<'transit' | 'measure'>('transit');
  readonly shapeCount = this.shapeService.shapeCount;
  readonly selectedShapeCount = this.shapeService.selectedShapeCount;
  readonly vehiclePositions = this.transitService.vehiclePositions;
  readonly vehiclePositionsLoading = this.transitService.vehiclePositionsLoading;
  readonly vehiclePositionsError = this.transitService.vehiclePositionsError;
  readonly mappableVehicles = computed(() => {
    const positions: unknown = this.vehiclePositions();
    return Array.isArray(positions) ? positions.filter(isMappableVehicle) : [];
  });

  ngOnInit(): void {
    void this.initializeMap();
  }

  onLinesChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.setSelectedLines(Array.from(select.selectedOptions, option => option.value));
  }

  selectAllLines(): void {
    this.setSelectedLines(this.lines());
  }

  clearSelectedLines(): void {
    this.setSelectedLines([]);
  }

  toggleLabels(): void {
    this.showLabels.set(!this.showLabels());
    this.layerService.setVisibleLines(this.selectedLines(), this.showLabels());
  }

  toggleControls(): void {
    this.controlsOpen.update(open => !open);
  }

  showControlsMenu(menu: 'transit' | 'measure'): void {
    this.activeControlsMenu.set(menu);
  }

  setDrawMode(mode: 'line' | 'circle' | null): void {
    const nextMode = this.drawMode() === mode ? null : mode;
    this.drawMode.set(nextMode);
    this.shapeService.setDrawMode(nextMode);
  }

  deleteSelectedShapes(): void {
    this.shapeService.removeSelectedShapes();
  }

  deleteAllShapes(): void {
    this.shapeService.clearShapes();
  }

  refreshVehiclePositions(): void {
    console.log('Refreshing vehicle positions...');
    const map = this.mapService.getMap();
    if (!map) return;

    void this.layerService.refreshVehiclePositions(map).catch(() => undefined);
  }

  focusVehicle(vehicle: VehiclePosition): void {
    const longitude = vehicle.longitude;
    const latitude = vehicle.latitude;
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)
      || typeof latitude !== 'number' || !Number.isFinite(latitude)) return;

    this.mapService.focusOnCoordinates(longitude, latitude);
  }

  private setSelectedLines(lines: string[]): void {
    this.selectedLines.set(lines);
    this.layerService.setVisibleLines(lines, this.showLabels());
  }

  private async initializeMap(): Promise<void> {
    try {
      const lines = await this.mapService.createMap(this.mapElement.nativeElement);
      this.lines.set(lines);
      this.setSelectedLines(lines);
      this.shapeService.initialize();
      this.refreshVehiclePositions();
    } catch {
      this.loadError.set(true);
    }
  }
}

function isMappableVehicle(value: unknown): value is VehiclePosition {
  if (typeof value !== 'object' || value === null) return false;
  const vehicle = value as VehiclePosition;
  return typeof vehicle.longitude === 'number' && Number.isFinite(vehicle.longitude)
    && typeof vehicle.latitude === 'number' && Number.isFinite(vehicle.latitude);
}