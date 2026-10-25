import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { AgencyRouteDTO, TemplateRouteDTO } from '../api/generated';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { TemplateEditorService } from './template-editor.service';
import { TemplateRoutePickerComponent } from './template-route-picker.component';
import { expectNoAxeViolations } from '../../testing/axe';

const ROUTES: AgencyRouteDTO[] = [
  { routeId: 'r6', agencyName: 'Västtrafik', routeShortName: '6', routeType: '900' },
  { routeId: 'r16', agencyName: 'Västtrafik', routeShortName: '16', routeType: '700' },
  { routeId: 'far', agencyName: 'Västtrafik', routeShortName: 'X4', routeType: '700' }
];

describe('TemplateRoutePickerComponent', () => {
  let routeIds: ReturnType<typeof signal<string[]>>;
  let element: HTMLElement;
  let detectChanges: () => void;

  beforeEach(() => {
    routeIds = signal(['far', 'gone']);
    const savedRoutes = signal<TemplateRouteDTO[]>([
      { routeId: 'gone', routeShortName: '99', agencyName: 'Västtrafik', routeType: '700', available: false }
    ]);
    const byId = new Map(ROUTES.map(route => [route.routeId!, route]));

    TestBed.configureTestingModule({
      imports: [TemplateRoutePickerComponent],
      providers: [
        { provide: RouteCatalogService, useValue: { route: (id: string) => byId.get(id) } },
        {
          provide: TemplateEditorService,
          useValue: {
            area: signal({ west: 0, south: 0, east: 1, north: 1 }),
            routeIds,
            savedRoutes,
            routeIdsInArea: computed(() => new Set(['r6', 'r16'])),
            routesInAreaLoading: signal(false),
            routesInAreaFailed: signal(false),
            canEdit: signal(true),
            busy: signal(false),
            setRouteIds: (ids: string[]) => routeIds.set([...new Set(ids)])
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(TemplateRoutePickerComponent);
    element = fixture.nativeElement as HTMLElement;
    detectChanges = () => fixture.detectChanges();
    detectChanges();
  });

  function labels(): string[] {
    return [...element.querySelectorAll('.route-checklist label')].map(label => label.textContent!.replace(/\s+/g, ' ').trim());
  }

  function checkbox(text: string): HTMLInputElement {
    const label = [...element.querySelectorAll('.route-checklist label')].find(item => item.textContent!.includes(text));
    return label!.querySelector('input')!;
  }

  it('lists the routes in the area and the chosen ones outside it, marked', async () => {
    await expectNoAxeViolations(element);
    expect(labels()).toEqual([
      'Västtrafik - 6',
      'Västtrafik - 16',
      'Västtrafik - 99 no longer in the timetable',
      'Västtrafik - X4 outside the area'
    ]);
    expect(checkbox('X4').checked).toBe(true);
    expect(checkbox('- 6').checked).toBe(false);
  });

  it('chooses and removes routes', () => {
    checkbox('- 16').click();
    expect(routeIds()).toEqual(['far', 'gone', 'r16']);

    checkbox('X4').click();
    expect(routeIds()).toEqual(['gone', 'r16']);
  });

  it('filters by search and mode, and chooses only the routes shown', () => {
    const search = element.querySelector('#template-route-search') as HTMLInputElement;
    search.value = '16';
    search.dispatchEvent(new Event('input'));
    detectChanges();
    expect(labels()).toEqual(['Västtrafik - 16']);

    (element.querySelector('.panel-actions button') as HTMLButtonElement).click();
    expect(routeIds()).toEqual(['far', 'gone', 'r16']);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const mode = element.querySelector('#template-route-type') as HTMLSelectElement;
    detectChanges();
    mode.value = '900';
    mode.dispatchEvent(new Event('change'));
    detectChanges();
    expect(labels()).toEqual(['Västtrafik - 6']);
  });
});
