import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapComponent } from './map.component';
import { LayerService } from '../layer/layer.service';
import { MapService } from './map.service';
import { TransitService as TransitDataService } from '../transit/transit.service';
import { TransitService as TransitApiService } from '../api/generated/api/transit.service';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';
import { of } from 'rxjs';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });

    await TestBed.configureTestingModule({
      imports: [MapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps controls hidden until opened and renders only the active menu', () => {
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('#map-controls-panel')).toBeNull();

    controlsToggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#line-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Measure shapes"]')).toBeNull();

    const menuButtons = fixture.nativeElement.querySelectorAll('.menu-switcher button') as NodeListOf<HTMLButtonElement>;
    const measureMenuButton = Array.from(menuButtons)
      .find(button => button.textContent?.trim() === 'Measure');
    expect(measureMenuButton).toBeTruthy();
    measureMenuButton?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#line-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Measure shapes"]')).toBeTruthy();

    controlsToggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#map-controls-panel')).toBeNull();
  });

  it('refreshes vehicle positions when the map button is pressed', () => {
    const refresh = vi.spyOn(TestBed.inject(LayerService), 'refreshVehiclePositions').mockResolvedValue();
    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const refreshButton = Array.from(buttons)
      .find(button => button.textContent?.includes('Refresh vehicles'));
    expect(refreshButton).toBeTruthy();
    if (!refreshButton) return;
    refreshButton.click();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('focuses the map on a selected vehicle', () => {
    const vehicle = {
      id: 'vehicle-1',
      latitude: 57.7848,
      longitude: 14.2271
    };
    TestBed.inject(TransitDataService).vehiclePositions.set([vehicle]);
    const focus = vi.spyOn(TestBed.inject(MapService), 'focusOnCoordinates');
    fixture.detectChanges();

    const controlsToggle = fixture.nativeElement.querySelector('#map-controls-toggle') as HTMLButtonElement;
    controlsToggle.click();
    fixture.detectChanges();
    const vehicleButton = fixture.nativeElement.querySelector('.vehicle-item') as HTMLButtonElement;
    expect(vehicleButton).toBeTruthy();
    vehicleButton.click();

    expect(focus).toHaveBeenCalledWith(vehicle.longitude, vehicle.latitude);
  });

  it('keeps the last positions when the API response is not an array', async () => {
    const vehicleService = TestBed.inject(TransitDataService);
    const previousPositions = [{ id: 'vehicle-1', latitude: 57.7848, longitude: 14.2271 }];
    vehicleService.vehiclePositions.set(previousPositions);
    vi.spyOn(TestBed.inject(TransitApiService), 'getVehiclePositions')
      .mockReturnValue(of({} as unknown as VehiclePosition[]) as never);

    await expect(vehicleService.refreshVehiclePositions())
      .rejects.toThrow('Vehicle positions response must be an array');

    expect(vehicleService.vehiclePositions()).toEqual(previousPositions);
    expect(vehicleService.vehiclePositionsError()).toBe(true);
    expect(component.mappableVehicles()).toEqual(previousPositions);
  });
});
