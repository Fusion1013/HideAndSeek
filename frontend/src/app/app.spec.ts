import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { RouteControllerService, StopControllerService } from './api/generated';
import { TransitService as TransitApiService } from './api/generated/api/transit.service';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: RouteControllerService, useValue: { getRoutes: () => of([]) } },
        { provide: StopControllerService, useValue: { getStops: () => of([]) } },
        { provide: TransitApiService, useValue: { getVehiclePositions: () => of([]) } }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render transit line controls', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('#map-controls-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('#line-select')).toBeTruthy();
  });
});
