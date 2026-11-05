import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { ControlsPanelService } from '../controls/controls-panel.service';
import { ReachabilityService } from '../shape/reachability.service';
import { RouteCatalogService } from '../transit/route-catalog.service';
import { StationPanelComponent } from './station-panel.component';
import { buildStationTimetableRows, buildStopServiceLegend } from './station-timetable';
import type { StationStopTimeRow } from './station-timetable';
import { StationTimetableService } from './station-timetable.service';

describe('StationPanelComponent', () => {
  function render(stopTimes: StationStopTimeRow[]) {
    TestBed.configureTestingModule({
      providers: [
        { provide: StationTimetableService, useValue: {
          stop: signal({ stopId: 'stop-1', stopName: 'Central' }),
          rows: signal(buildStationTimetableRows(stopTimes, 0)),
          serviceLegend: signal(buildStopServiceLegend(stopTimes)),
          loading: signal(false),
          error: signal(false)
        } },
        { provide: ControlsPanelService, useValue: {} },
        { provide: ReachabilityService, useValue: {} },
        { provide: RouteCatalogService, useValue: { route: () => undefined } }
      ]
    });
    return TestBed.createComponent(StationPanelComponent);
  }

  it('words a row\'s pickup and drop off under its times, for sight and for screen readers', async () => {
    const fixture = render([
      { id: 'a', tripShortName: '10', arrivalTime: '08:00:00', departureTime: '08:01:00', pickupType: 1, dropOffType: 3 }
    ]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const [, arrival, departure] = Array.from(element.querySelectorAll('tbody td'));
    expect(arrival.querySelector('[aria-hidden="true"]')?.textContent).toBe('Ask driver');
    expect(arrival.querySelector('.visually-hidden')?.textContent).toBe('Must coordinate with driver to arrange drop off');
    expect(departure.querySelector('[aria-hidden="true"]')?.textContent).toBe('No pickup');
    expect(departure.querySelector('.visually-hidden')?.textContent).toBe('No pickup available');

    const key = Array.from(element.querySelectorAll('dl[aria-label="Pickup and drop off notes"] div')).map(entry => entry.textContent);
    expect(key).toEqual([
      'Arrival: Ask driverMust coordinate with driver to arrange drop off',
      'Departure: No pickupNo pickup available'
    ]);

    await expectNoAxeViolations(element);
  });

  it('adds nothing to regular service', async () => {
    const fixture = render([
      { id: 'a', tripShortName: '10', arrivalTime: '08:00:00', departureTime: '08:01:00', pickupType: 0 }
    ]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.stop-time-note')).toBeNull();
    expect(element.querySelector('dl[aria-label="Pickup and drop off notes"]')).toBeNull();
  });
});
