import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';

const TEST_ENV = {
  production: false,
  googleClientId: 'test-client-id',
  apiBaseUrl: 'https://api.example.com',
};

const AUTHORIZE_HOST = 'https://accounts.google.com/o/oauth2/v2/auth';
const EXCHANGE_URL = 'https://api.example.com/Auth/token';

function serviceWithStorage(storage: Record<string, string>) {
  vi.stubGlobal(
    'localStorage',
    {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => (storage[k] = v),
      removeItem: (k: string) => delete storage[k],
    },
  );
  vi.stubGlobal(
    'sessionStorage',
    {
      getItem: (k: string) => storage['session:' + k] ?? null,
      setItem: (k: string, v: string) => (storage['session:' + k] = v),
      removeItem: (k: string) => delete storage['session:' + k],
    },
  );
  return TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
  }).inject(AuthService);
}

// The Angular unit-test builder runs vitest with `isolate: false`: spec files
// in the same worker share one environment, so global stubs created here
// (storage, location, fetch) leak into the next file the worker runs. Tear
// them down after each test — otherwise a later spec's `localStorage.clear()`
// hits our clear-less storage stub (CI failure, PR #33).
afterEach(() => {
  vi.unstubAllGlobals();
});

function okTokenResponse() {
  return new Response(
    JSON.stringify({
      idToken: 'new.id.token',
      accessToken: 'new.at',
      expiresIn: 3600,
    }),
    { status: 200 },
  );
}

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal('location', {
    origin: 'https://app.example.com',
    href: 'https://app.example.com/some/route',
    assign,
  });
  vi.stubGlobal('fetch', vi.fn(async () => okTokenResponse()));
});

describe('AuthService initialization', () => {
  it('starts unauthenticated when nothing is persisted', () => {
    const auth = serviceWithStorage({});
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restores a persisted, unexpired session across reloads', () => {
    const auth = serviceWithStorage({
      'guito.auth.session': JSON.stringify({
        idToken: 'id',
        accessToken: 'at',
        expiresAt: Date.now() + 60_000,
      }),
    });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.session()?.idToken).toBe('id');
  });

  it('treats a persisted expired session as signed out', () => {
    const auth = serviceWithStorage({
      'guito.auth.session': JSON.stringify({
        idToken: 'id',
        accessToken: 'at',
        expiresAt: Date.now() - 1_000,
      }),
    });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('AuthService.signIn', () => {
  it('stores the PKCE pair and redirects to the Google authorize URL with S256', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);

    await auth.signIn('/expenses');

    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(pkce.state).toBeTruthy();
    expect(pkce.returnUrl).toBe('/expenses');

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(AUTHORIZE_HOST);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(TEST_ENV.googleClientId);
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe(pkce.state);
  });

  it('defaults returnUrl to the home route', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    expect(JSON.parse(storage['session:guito.auth.pkce']).returnUrl).toBe('/');
  });
});

describe('AuthService.completeSignIn', () => {
  it('exchanges the code, persists the session, and returns the returnUrl', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn('/expenses');
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);

    const returnUrl = await auth.completeSignIn({ code: 'abc', state: pkce.state });

    expect(returnUrl).toBe('/expenses');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.session()?.idToken).toBe('new.id.token');
    expect(storage['guito.auth.session']).toContain('new.id.token');
    expect(storage['session:guito.auth.pkce']).toBeUndefined();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(EXCHANGE_URL, expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toEqual({
      code: 'abc',
      codeVerifier: pkce.verifier,
      redirectUri: 'https://app.example.com/auth/callback',
    });
    // No client_secret and no client_id — the API adds both server-side.
    expect(Object.keys(body).sort()).toEqual(['code', 'codeVerifier', 'redirectUri']);
  });

  it('rejects a state mismatch without exchanging the code', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn('/expenses');

    await expect(
      auth.completeSignIn({ code: 'abc', state: 'forged-state' }),
    ).rejects.toThrowError(/state/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage['guito.auth.session']).toBeUndefined();
  });

  it('rejects the Google error redirect without exchanging the code', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();

    await expect(
      auth.completeSignIn({ error: 'access_denied', state: 'whatever' }),
    ).rejects.toThrowError(/access_denied/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects with the RFC 6749 error when the exchange endpoint rejects the code', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'code was already redeemed' }),
        { status: 400 },
      )),
    );

    await expect(
      auth.completeSignIn({ code: 'abc', state: pkce.state }),
    ).rejects.toThrowError(/invalid_grant/);
    expect(storage['guito.auth.session']).toBeUndefined();
  });

  it('rejects with a status-only message when the exchange failure body is not RFC 6749 JSON', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Internal Server Error', { status: 502 })),
    );

    await expect(
      auth.completeSignIn({ code: 'abc', state: pkce.state }),
    ).rejects.toThrowError(/502/);
  });
});

describe('AuthService.signOut', () => {
  it('clears the persisted session and the auth state', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    await auth.completeSignIn({ code: 'abc', state: pkce.state });
    expect(auth.isAuthenticated()).toBe(true);

    auth.signOut();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.session()).toBeNull();
    expect(storage['guito.auth.session']).toBeUndefined();
  });

  it('returns the /signin redirect target', () => {
    const auth = serviceWithStorage({});
    expect(auth.signOut()).toBe('/signin');
  });
});
