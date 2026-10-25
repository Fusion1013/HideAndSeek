import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * What the app is being used for. Overview: browsing the map. Create: setting up a game template.
 * Game: joining and playing a game.
 */
export type AppMode = 'overview' | 'create' | 'game';

const MODES: readonly AppMode[] = ['overview', 'create', 'game'];

/** The current mode, from the `mode` in the active route's data (see app.routes.ts). */
@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly router = inject(Router);

  readonly mode = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => modeOf(this.router.routerState.snapshot.root))
    ),
    { initialValue: modeOf(this.router.routerState.snapshot.root) }
  );
}

/** The mode of the deepest route that declares one; overview when none does. */
function modeOf(route: ActivatedRouteSnapshot): AppMode {
  let mode: AppMode = 'overview';
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    const declared: unknown = current.data['mode'];
    if (isAppMode(declared)) mode = declared;
  }
  return mode;
}

function isAppMode(value: unknown): value is AppMode {
  return MODES.includes(value as AppMode);
}
