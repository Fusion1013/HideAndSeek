import { Injectable, Injector, signal, Type } from '@angular/core';

/** A component shown over the map, with the injector it is created in. */
export interface MapOverlay {
  readonly component: Type<unknown>;
  readonly injector: Injector;
}

/** Where an overlay sits: along the bottom of the map, or as a small status at its top left, beside the zoom buttons. */
export type MapOverlayPlace = 'bottom' | 'status';

/**
 * What is shown over the map, outside the controls panel: one thing in each place at a time, put there by the
 * mode that owns it (the game page's replay slider and its status, for two).
 */
@Injectable({ providedIn: 'root' })
export class MapOverlayService {
  private readonly bottom = signal<MapOverlay | null>(null);
  private readonly top = signal<MapOverlay | null>(null);
  readonly overlay = this.bottom.asReadonly();
  readonly status = this.top.asReadonly();

  /** Shows the component until the returned function is called. */
  show(overlay: MapOverlay, place: MapOverlayPlace = 'bottom'): () => void {
    const shown = place === 'bottom' ? this.bottom : this.top;
    shown.set(overlay);
    return () => {
      if (shown() === overlay) shown.set(null);
    };
  }
}
