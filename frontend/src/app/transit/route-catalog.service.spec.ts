import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AgencyRouteControllerService } from '../api/generated';
import { RouteCatalogService } from './route-catalog.service';
import { normalizeSearchText, routeListLabel, routeTypeLabel } from './route-labels';

describe('RouteCatalogService', () => {
  function create(getAgencyRoutes: () => unknown) {
    TestBed.configureTestingModule({
      providers: [{ provide: AgencyRouteControllerService, useValue: { getAgencyRoutes } }]
    });
    return TestBed.inject(RouteCatalogService);
  }

  it('sorts routes by their listed label and indexes them by id', async () => {
    const catalog = create(() => of([
      { routeId: 'beta-a', agencyName: 'Beta', routeShortName: 'A', routeType: '2' },
      { routeId: 'alpha-10', agencyName: 'Alpha', routeShortName: '10', routeType: '3' },
      { routeId: 'alpha-2', agencyName: 'Alpha', routeShortName: '2', routeType: '3' }
    ]));
    await vi.waitFor(() => expect(catalog.routes()).toHaveLength(3));

    expect(catalog.routes().map(routeListLabel)).toEqual(['Alpha - 2', 'Alpha - 10', 'Beta - A']);
    expect(catalog.route('alpha-10')?.routeShortName).toBe('10');
    expect(catalog.route(undefined)).toBeUndefined();
    expect(catalog.agencies()).toEqual(['Alpha', 'Beta']);
    expect(catalog.routeTypes()).toEqual(['2', '3']);
    expect(catalog.loadError()).toBe(false);
  });

  it('reports a failed load', async () => {
    const catalog = create(() => throwError(() => new Error('offline')));
    await vi.waitFor(() => expect(catalog.loadError()).toBe(true));
    expect(catalog.routes()).toEqual([]);
  });
});

describe('route labels', () => {
  it('names route types and normalizes search text', () => {
    expect(routeTypeLabel('3')).toBe('Bus');
    expect(routeTypeLabel('700')).toBe('Bus');
    expect(routeTypeLabel('900')).toBe('Tram');
    expect(routeTypeLabel('9999')).toBe('Route type 9999');
    expect(routeTypeLabel(undefined)).toBe('Unknown type');
    expect(normalizeSearchText('  Malmö ')).toBe('malmo');
  });
});
