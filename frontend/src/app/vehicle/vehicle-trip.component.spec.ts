import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { StopDTO, VehiclePosition } from '../api/generated';
import { StopsLayerService } from '../layer/stops-layer.service';
import { MapService } from '../map/map.service';
import { VehicleTripComponent } from './vehicle-trip.component';

describe('VehicleTripComponent', () => {
  // Four stops heading east, 0.01° of longitude (about 600 m) apart
  const stops: StopDTO[] = [0, 1, 2, 3].map(i => ({
    stopId: `stop-${i}`, stopName: `Stop ${i}`, platformCode: i === 1 ? 'B' : undefined, longitude: 14 + i * 0.01, latitude: 57.78
  }));
  const stopTimes = stops.map((stop, i) => ({
    tripId: 'trip-1', stopId: stop.stopId, stopSequence: i + 1, arrivalTime: `08:0${i * 2}:00`, departureTime: `08:0${i * 2}:00`
  }));
  const focusOnCoordinates = vi.fn();

  const trip = { trip: { tripId: 'trip-1', tripHeadsign: 'Stop 3' }, stopTimes, shape: [] };

  function render(vehicle: VehiclePosition) {
    TestBed.configureTestingModule({
      providers: [
        { provide: StopsLayerService, useValue: { stopsById: signal(new Map(stops.map(stop => [stop.stopId!, stop]))) } },
        { provide: MapService, useValue: { focusOnCoordinates } }
      ]
    });
    const fixture = TestBed.createComponent(VehicleTripComponent);
    fixture.componentRef.setInput('vehicle', vehicle);
    fixture.componentRef.setInput('route', { routeId: 'route-11', routeShortName: '11', agencyName: 'Länstrafiken' });
    fixture.componentRef.setInput('trip', vehicle.tripId ? trip : undefined);
    return fixture;
  }

  it('lists the stops in order and shows the vehicle between the stops it is travelling between', async () => {
    const fixture = render({ id: 'bus-1', tripId: 'trip-1', routeId: 'route-11', longitude: 14.015, latitude: 57.7801, speedMetersPerSecond: 10 });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.route-badge')?.textContent?.trim()).toBe('11');
    expect(element.querySelector('h3')?.textContent).toContain('Towards Stop 3');
    expect(element.textContent).toContain('36 km/h');

    const items = Array.from(element.querySelectorAll('.trip-stops li'));
    expect(items.map(item => item.querySelector('.stop-name')?.textContent?.trim().split(/\s+/).slice(0, 2).join(' ')))
      .toEqual(['Stop 0', 'Stop 1', 'Stop 2', 'Stop 3']);
    expect(items.map(item => item.className.match(/stop-(\w+)/)?.[1])).toEqual(['passed', 'passed', 'next', 'upcoming']);
    expect(items[1].querySelector('.vehicle-marker')).toBeTruthy();
    expect(items[2].getAttribute('aria-current')).toBe('step');

    const progressBar = element.querySelector('[role="progressbar"]');
    expect(progressBar?.getAttribute('aria-valuetext')).toContain('Heading for Stop 2');
    expect(Number(progressBar?.getAttribute('aria-valuenow'))).toBe(50);
  });

  it('shows a vehicle standing at a stop on that stop', async () => {
    const fixture = render({ id: 'bus-1', tripId: 'trip-1', routeId: 'route-11', longitude: 14.02, latitude: 57.78 });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.stop-current .stop-name')?.textContent).toContain('Stop 2');
    expect(element.querySelector('.vehicle-marker')).toBeNull();
    expect(element.querySelector('.next-stop-label')?.textContent).toBe('At stop');
  });

  it('centres the map on a stop when it is clicked', async () => {
    const fixture = render({ id: 'bus-1', tripId: 'trip-1', routeId: 'route-11', longitude: 14.015, latitude: 57.78 });
    await fixture.whenStable();

    (fixture.nativeElement.querySelectorAll('.trip-stops button')[3] as HTMLButtonElement).click();

    expect(focusOnCoordinates).toHaveBeenCalledWith(14.03, 57.78);
  });

  it('says so when the trip could not be loaded', async () => {
    const fixture = render({ id: 'bus-1', tripId: 'trip-1', routeId: 'route-11', longitude: 14.005, latitude: 57.78 });
    fixture.componentRef.setInput('trip', undefined);
    fixture.componentRef.setInput('tripError', true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  });

  it('explains when the vehicle is not on a trip', async () => {
    const fixture = render({ id: 'bus-2', longitude: 14, latitude: 57.78 });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('not on a scheduled trip');
    expect(fixture.nativeElement.querySelector('.trip-stops')).toBeNull();
  });
});
