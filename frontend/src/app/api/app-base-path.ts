import { PlatformLocation } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

/**
 * The path the app is served under, from the page's `<base href>`: '' at the site root, '/hideandseek' when
 * hosted there. The API sits under the same path, so requests to it start with this.
 */
export const APP_BASE_PATH = new InjectionToken<string>('APP_BASE_PATH', {
  providedIn: 'root',
  factory: () => basePathOf(inject(PlatformLocation).getBaseHrefFromDOM())
});

/** The base href without its trailing slash; '' for the root or no base href. */
export function basePathOf(baseHref: string | null | undefined): string {
  const path = baseHref ? new URL(baseHref, 'http://base.invalid').pathname : '/';
  return path.replace(/\/+$/, '');
}
