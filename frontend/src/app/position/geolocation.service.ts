import { Injectable, signal } from '@angular/core';

export interface GeoPosition {
  longitude: number;
  latitude: number;
  /** Radius of the 95% confidence circle, in meters. */
  accuracyMeters: number;
  timestamp: number;
}

export type GeolocationError = 'unsupported' | 'permission-denied' | 'unavailable' | 'timeout';

/**
 * Tracks the device's GPS position. Several features can use it at once: each calls
 * {@link track} and the watch runs while at least one of them still holds a handle.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private watchId: number | null = null;
  private trackers = 0;

  readonly position = signal<GeoPosition | null>(null);
  readonly error = signal<GeolocationError | null>(null);
  readonly tracking = signal(false);

  /** Starts tracking if needed. Call the returned function to release this consumer's hold. */
  track(): () => void {
    this.trackers++;
    if (this.trackers === 1) this.startWatch();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.trackers--;
      if (this.trackers === 0) this.stopWatch();
    };
  }

  private startWatch(): void {
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geolocation) {
      this.error.set('unsupported');
      return;
    }

    this.error.set(null);
    this.tracking.set(true);
    this.watchId = geolocation.watchPosition(
      position => {
        this.error.set(null);
        this.position.set({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          accuracyMeters: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      error => this.error.set(toGeolocationError(error)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  private stopWatch(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.tracking.set(false);
  }
}

function toGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED: return 'permission-denied';
    case error.TIMEOUT: return 'timeout';
    default: return 'unavailable';
  }
}
