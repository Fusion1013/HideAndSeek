import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, UrlTree } from '@angular/router';
import { filter } from 'rxjs';

/**
 * What the app is being used for. Overview: browsing the map. Create: setting up a game template.
 * Game: joining and playing a game.
 */
export type AppMode = 'overview' | 'create' | 'game';

const MODES: readonly AppMode[] = ['overview', 'create', 'game'];

/** Each mode's name, for page and panel titles. */
export const MODE_TITLES: Readonly<Record<AppMode, string>> = { overview: 'Overview', create: 'Create a game', game: 'Play' };

/**
 * The current mode, from the `mode` in the active route's data (see app.routes.ts), and the address each mode
 * was last left at, so going back to a mode returns to the template or game that was open there.
 */
@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly router = inject(Router);

  private readonly current = signal(modeOf(this.router.routerState.snapshot.root));
  readonly mode = this.current.asReadonly();

  private readonly lastUrls = signal<Readonly<Record<AppMode, UrlTree | string>>>({ overview: '/', create: '/create', game: '/join' });
  /** Where each mode's link leads: the last page seen in that mode, or the mode's start page. */
  readonly modeUrls = this.lastUrls.asReadonly();

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed()
    ).subscribe(event => {
      const mode = modeOf(this.router.routerState.snapshot.root);
      this.current.set(mode);
      this.lastUrls.update(urls => ({ ...urls, [mode]: this.router.parseUrl(event.urlAfterRedirects) }));
    });
  }
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
