import { DOCUMENT, inject, Injectable, InjectionToken } from '@angular/core';

/** What the store keeps: a player token for each joined game, an owner token for each created template. */
interface StoredTokens {
  games: Record<string, string>;
  templates: Record<string, string>;
}

export type TokenKind = keyof StoredTokens;

const STORAGE_KEY = 'jetlag.accessTokens';

/** Where the tokens are kept: the page's local storage, or null where there is none. */
export const TOKEN_STORAGE = new InjectionToken<Storage | null>('TOKEN_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
});

/**
 * The tokens the backend issues instead of accounts. They are kept in this browser only, so reopening the site
 * returns to the same games and templates; clearing site data loses them.
 */
@Injectable({ providedIn: 'root' })
export class AccessTokenStore {
  /** Null once storage turns out to be unusable; from then on the tokens only last until the page closes. */
  private storage = inject(TOKEN_STORAGE);
  private memory: StoredTokens = { games: {}, templates: {} };

  get(kind: TokenKind, id: string): string | undefined {
    return this.read()[kind][id];
  }

  set(kind: TokenKind, id: string, token: string): void {
    const tokens = this.read();
    tokens[kind][id] = token;
    this.write(tokens);
  }

  remove(kind: TokenKind, id: string): void {
    const tokens = this.read();
    delete tokens[kind][id];
    this.write(tokens);
  }

  /** The IDs of every game or template this browser holds a token for. */
  ids(kind: TokenKind): string[] {
    return Object.keys(this.read()[kind]);
  }

  /** A fresh copy, which the caller may change. */
  private read(): StoredTokens {
    let stored: unknown = this.memory;
    if (this.storage) {
      try {
        stored = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? 'null');
      } catch {
        // Unreadable or not JSON: start over
        stored = null;
      }
    }
    return { games: tokenRecord(stored, 'games'), templates: tokenRecord(stored, 'templates') };
  }

  private write(tokens: StoredTokens): void {
    this.memory = tokens;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      // Full or blocked (e.g. some private windows): keep the tokens in memory instead
      this.storage = null;
    }
  }
}

/** Only string entries survive, whatever else ended up in storage. */
function tokenRecord(stored: unknown, kind: TokenKind): Record<string, string> {
  if (typeof stored !== 'object' || stored === null) return {};
  const record: unknown = (stored as Record<string, unknown>)[kind];
  if (typeof record !== 'object' || record === null) return {};
  return Object.fromEntries(Object.entries(record).filter(([, token]) => typeof token === 'string'));
}
