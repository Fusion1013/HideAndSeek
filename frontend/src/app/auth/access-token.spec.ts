import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { accessTokenInterceptor } from './access-token.interceptor';
import { AccessTokenStore, TOKEN_STORAGE } from './access-token.store';

/** The parts of Storage the store uses, in memory. */
class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('access tokens', () => {
  let store: AccessTokenStore;
  let http: HttpClient;
  let backend: HttpTestingController;
  let localStorage: MemoryStorage;

  beforeEach(() => {
    localStorage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([accessTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: TOKEN_STORAGE, useValue: localStorage }
      ]
    });
    store = TestBed.inject(AccessTokenStore);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function authorizationOf(url: string, headers: Record<string, string> = {}): string | null {
    http.get(url, { headers }).subscribe();
    const request = backend.expectOne(url);
    request.flush({});
    return request.request.headers.get('Authorization');
  }

  it('keeps tokens per game and per template in local storage', () => {
    store.set('games', 'g1', 'player-token');
    store.set('templates', 'g1', 'owner-token');

    const reloaded = TestBed.runInInjectionContext(() => new AccessTokenStore());
    expect(reloaded.get('games', 'g1')).toBe('player-token');
    expect(reloaded.get('templates', 'g1')).toBe('owner-token');
    expect(reloaded.ids('games')).toEqual(['g1']);

    store.remove('games', 'g1');
    expect(store.get('games', 'g1')).toBeUndefined();
  });

  it('keeps tokens in memory when storage refuses them', () => {
    localStorage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    store.set('games', 'g1', 'player-token');
    expect(store.get('games', 'g1')).toBe('player-token');
  });

  it('ignores storage it cannot understand', () => {
    localStorage.setItem('jetlag.accessTokens', '{"games": {"g1": 42, "g2": "ok"}, "templates": "x"}');
    expect(store.get('games', 'g1')).toBeUndefined();
    expect(store.get('games', 'g2')).toBe('ok');
    expect(store.ids('templates')).toEqual([]);

    localStorage.setItem('jetlag.accessTokens', 'not json');
    expect(store.ids('games')).toEqual([]);
  });

  it('sends the matching token with game and template requests only', () => {
    store.set('games', 'g1', 'player-token');
    store.set('templates', 't1', 'owner-token');

    expect(authorizationOf('/api/games/g1/questions')).toBe('Bearer player-token');
    expect(authorizationOf('/api/templates/t1')).toBe('Bearer owner-token');
    expect(authorizationOf('/api/games/other')).toBeNull();
    expect(authorizationOf('/api/routes')).toBeNull();
    expect(authorizationOf('https://elsewhere.example/api/games/g1')).toBeNull();
    expect(authorizationOf('/api/games/g1', { Authorization: 'Bearer explicit' })).toBe('Bearer explicit');
  });
});
