import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AccessTokenStore, TokenKind } from './access-token.store';

/** Which token a request needs, by the resource its path starts with. */
const TOKEN_PATHS: readonly (readonly [RegExp, TokenKind])[] = [
  [/^\/api\/games\/([^/?#]+)/, 'games'],
  [/^\/api\/templates\/([^/?#]+)/, 'templates']
];

/**
 * Sends the stored token with requests about a game or template: a player's token for /api/games/{id}/...,
 * the owner's token for /api/templates/{id}/... A request that already has an Authorization header keeps it.
 */
export const accessTokenInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.headers.has('Authorization')) return next(request);

  const path = pathOf(request.url);
  for (const [pattern, kind] of TOKEN_PATHS) {
    const id = pattern.exec(path)?.[1];
    if (!id) continue;
    const token = inject(AccessTokenStore).get(kind, decodeURIComponent(id));
    return next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);
  }
  return next(request);
};

/** The path of a relative or absolute URL; tokens only go to this site's own API. */
function pathOf(url: string): string {
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return parsed.origin === globalThis.location?.origin ? parsed.pathname : '';
  } catch {
    return '';
  }
}
