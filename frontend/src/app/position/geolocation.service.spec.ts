import { TestBed } from '@angular/core/testing';
import { GeolocationService } from './geolocation.service';

describe('GeolocationService', () => {
  let onPosition: PositionCallback;
  let onError: PositionErrorCallback;
  const geolocation = {
    watchPosition: vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
      onPosition = success;
      onError = error;
      return 7;
    }),
    clearWatch: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { geolocation });
    vi.stubGlobal('isSecureContext', true);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('watches while at least one consumer is tracking', () => {
    const service = TestBed.inject(GeolocationService);

    const releaseFirst = service.track();
    const releaseSecond = service.track();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(service.tracking()).toBe(true);

    releaseFirst();
    releaseFirst();   // releasing twice must not release the other consumer
    expect(geolocation.clearWatch).not.toHaveBeenCalled();

    releaseSecond();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(service.tracking()).toBe(false);
  });

  it('publishes positions and errors', () => {
    const service = TestBed.inject(GeolocationService);
    service.track();

    onPosition({ coords: { longitude: 12, latitude: 57.7, accuracy: 15 }, timestamp: 1000 } as GeolocationPosition);
    expect(service.position()).toEqual({ longitude: 12, latitude: 57.7, accuracyMeters: 15, timestamp: 1000 });

    onError({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    expect(service.error()).toBe('permission-denied');
  });

  it('reports when the browser has no geolocation', () => {
    vi.stubGlobal('navigator', {});
    const service = TestBed.inject(GeolocationService);
    service.track();
    expect(service.error()).toBe('unsupported');
  });

  it('reports a page served without HTTPS instead of asking for a position', () => {
    vi.stubGlobal('isSecureContext', false);
    const service = TestBed.inject(GeolocationService);
    service.track();
    expect(service.error()).toBe('insecure-context');
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });
});
