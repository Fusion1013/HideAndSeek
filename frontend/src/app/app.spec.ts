import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { RouteControllerService, StopControllerService } from './api/generated';
import { TransitService as TransitApiService } from './api/generated/api/transit.service';
import { expectNoAxeViolations } from '../testing/axe';

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
        provideRouter(routes),
        { provide: RouteControllerService, useValue: { getRoutes: () => of([]) } },
        { provide: StopControllerService, useValue: { getStops: () => of([]) } },
        { provide: TransitApiService, useValue: { getVehiclePositions: () => of([]) } }
      ]
    }).compileComponents();
  });

  async function render(url: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('#map-controls-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    return compiled;
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render transit line controls in overview mode', async () => {
    const compiled = await render('/');
    expect(compiled.querySelector('#line-list')).toBeTruthy();
    expect(compiled.querySelector('.mode-switcher [aria-current="page"]')?.textContent).toBe('Overview');
    await expectNoAxeViolations(compiled);
  });

  it('should show the template tab in create mode', async () => {
    const compiled = await render('/create');
    expect(compiled.querySelector('#line-list')).toBeNull();
    expect(compiled.querySelector('#template-heading')?.textContent).toBe('New template');
    expect(compiled.querySelector('.mode-switcher [aria-current="page"]')?.textContent).toBe('Create');
    await expectNoAxeViolations(compiled);
  });

  it('should show the game tab in game mode', async () => {
    const compiled = await render('/join');
    expect(compiled.querySelector('#join-heading')?.textContent).toBe('Join a game');
    expect(compiled.querySelector('.mode-switcher [aria-current="page"]')?.textContent).toBe('Play');
    await expectNoAxeViolations(compiled);
  });
});
