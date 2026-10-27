import { Injectable, Injector, signal, Type } from '@angular/core';

/** A component shown over the bottom of the map, with the injector it is created in. */
export interface MapOverlay {
  readonly component: Type<unknown>;
  readonly injector: Injector;
}

/**
 * What is shown along the bottom of the map, outside the controls panel: one thing at a time, put there by the
 * mode that owns it (the game page's replay slider, for one).
 */
@Injectable({ providedIn: 'root' })
export class MapOverlayService {
  private readonly shown = signal<MapOverlay | null>(null);
  readonly overlay = this.shown.asReadonly();

  /** Shows the component until the returned function is called. */
  show(overlay: MapOverlay): () => void {
    this.shown.set(overlay);
    return () => {
      if (this.shown() === overlay) this.shown.set(null);
    };
  }
}
