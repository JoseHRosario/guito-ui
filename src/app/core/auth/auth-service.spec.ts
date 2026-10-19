import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService, popupTiming, StaleSignInError } from './auth-service';

const TEST_ENV = {
  production: false,
  googleClientId: 'test-client-id',
  apiBaseUrl: 'https://api.example.com',
};

const AUTHORIZE_HOST = 'https://accounts.google.com/o/oauth2/v2/auth';
const EXCHANGE_URL = 'https://api.example.com/Auth/session/token';

function serviceWithStorage(storage: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => (storage[k] = v),
    removeItem: (k: string) => delete storage[k],
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storage['session:' + k] ?? null,
    setItem: (k: string, v: string) => (storage['session:' + k] = v),
    removeItem: (k: string) => delete storage['session:' + k],
  });
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
      sessionExpiresAt: '2099-01-01T00:00:00Z',
    }),
    { status: 200 },
  );
}

let assign: ReturnType<typeof vi.fn>;
let openFn: ReturnType<typeof vi.fn>;

interface FakePopup {
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
}

function fakePopup(): FakePopup & Window {
  return { closed: false, close: vi.fn() } as unknown as FakePopup & Window;
}

function postFromPopup(popup: Window, data: unknown, origin = 'https://app.example.com'): void {
  const event = new MessageEvent('message', { data, origin, source: popup });
  window.dispatchEvent(event);
}

beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal('location', {
    origin: 'https://app.example.com',
    href: 'https://app.example.com/some/route',
    assign,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => okTokenResponse()),
  );
  // Default: no popup available → the full-page redirect fallback runs, which
  // is what the existing signIn expectations (location.assign) describe.
  openFn = vi.fn(() => null);
  vi.stubGlobal('open', openFn);
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
        persistent: true,
        sessionExpiresAt: '2099-01-01T00:00:00Z',
        refreshedAt: Date.now(),
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
        persistent: true,
        sessionExpiresAt: '2099-01-01T00:00:00Z',
        refreshedAt: Date.now(),
        expiresAt: Date.now() - 1_000,
      }),
    });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('AuthService.signIn — popup flow (issue #36 desktop Back)', () => {
  it('opens a popup with the authorize URL and completes sign-in from the handoff message', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    const popup = fakePopup();
    openFn.mockReturnValue(popup);

    const startPromise = auth.signIn('/expenses');
    await vi.waitFor(() => expect(openFn).toHaveBeenCalledTimes(1));
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    const popupUrl = new URL(openFn.mock.calls[0][0] as string);
    expect(popupUrl.origin + popupUrl.pathname).toBe(AUTHORIZE_HOST);
    expect(popupUrl.searchParams.get('state')).toBe(pkce.state);

    postFromPopup(popup, {
      source: 'guito-auth-popup-handoff',
      code: 'abc',
      state: pkce.state,
    });

    expect(await startPromise).toBe('/expenses');
    expect(assign).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(true);
    expect(storage['session:guito.auth.pkce']).toBeUndefined();
  });

  it('ignores handoff messages that do not come from its own popup or origin', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    const popup = fakePopup();
    openFn.mockReturnValue(popup);

    const startPromise = auth.signIn();
    await vi.waitFor(() => expect(openFn).toHaveBeenCalledTimes(1));
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);

    // Wrong origin and wrong source: must be ignored, sign-in keeps waiting.
    postFromPopup(
      popup,
      { source: 'guito-auth-popup-handoff', code: 'abc', state: pkce.state },
      'https://evil.example.com',
    );
    const wrongWindow = fakePopup();
    postFromPopup(wrongWindow, {
      source: 'guito-auth-popup-handoff',
      code: 'x',
      state: pkce.state,
    });

    postFromPopup(popup, { source: 'guito-auth-popup-handoff', code: 'abc', state: pkce.state });
    await startPromise;
    expect(assign).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('falls back to the full-page redirect when the popup is blocked', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);

    await auth.signIn('/expenses');

    expect(assign).toHaveBeenCalledTimes(1);
    expect(new URL(assign.mock.calls[0][0] as string).host).toBe('accounts.google.com');
    // Pending PKCE survives: the full-page callback completes the flow.
    expect(JSON.parse(storage['session:guito.auth.pkce']).returnUrl).toBe('/expenses');
  });

  it('redirects straight to the full-page flow in standalone (installed PWA) mode', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const popup = fakePopup();
    openFn.mockReturnValue(popup);

    await auth.signIn();

    expect(openFn).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('aborts with an AuthError when the user closes the popup', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    const popup = fakePopup();
    openFn.mockReturnValue(popup);

    const startPromise = auth.signIn();
    await vi.waitFor(() => expect(openFn).toHaveBeenCalledTimes(1));
    popup.closed = true;

    await expect(startPromise).rejects.toThrowError(/closed/i);
    expect(assign).not.toHaveBeenCalled();
    expect(storage['session:guito.auth.pkce']).toBeUndefined();
  });

  it('falls back to the full-page redirect when no handoff arrives within the timeout', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    const popup = fakePopup();
    openFn.mockReturnValue(popup);
    // Real timers with a shortened window — deterministic under CI load,
    // unlike fake-timer advances racing the native crypto setup (PR #37).
    popupTiming.timeoutMs = 40;
    popupTiming.pollIntervalMs = 10;
    try {
      await auth.signIn();
      expect(assign).toHaveBeenCalledTimes(1);
      expect(new URL(assign.mock.calls[0][0] as string).host).toBe('accounts.google.com');
    } finally {
      popupTiming.timeoutMs = 120_000;
      popupTiming.pollIntervalMs = 500;
    }
  });

  it('does not navigate to a popup failure card after another login/logout changes the epoch', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    const popup = fakePopup();
    openFn.mockReturnValue(popup);
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const operation = auth.signIn('/budgets');
    const outcome = operation.catch((cause: Error) => cause.message);
    await vi.waitFor(() => expect(openFn).toHaveBeenCalledTimes(1));
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    postFromPopup(popup, { source: 'guito-auth-popup-handoff', code: 'abc', state: pkce.state });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    storage['guito.auth.epoch'] = 'new-epoch';
    finish(new Response(JSON.stringify({ error: 'service_starting' }), { status: 503 }));
    expect(await outcome).toMatch(/cancelled/i);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    { status: 503, error: 'service_starting', marker: 'service_starting' },
    { status: 500, error: 'temporarily_unavailable', marker: 'exchange_failed' },
    { status: 0, error: '', marker: 'connectivity' },
    { status: 200, error: '', marker: 'exchange_failed' },
  ])(
    'returns the existing callback error card after popup exchange failure, without another Google redirect: $marker',
    async ({ status, error, marker }) => {
      const storage: Record<string, string> = {};
      const auth = serviceWithStorage(storage);
      const popup = fakePopup();
      openFn.mockReturnValue(popup);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (status === 0) throw new TypeError('Failed to fetch');
          if (status === 200) return new Response('invalid JSON');
          return new Response(JSON.stringify({ error }), { status });
        }),
      );

      const startPromise = auth.signIn();
      await vi.waitFor(() => expect(openFn).toHaveBeenCalledTimes(1));
      const pkce = JSON.parse(storage['session:guito.auth.pkce']);
      postFromPopup(popup, { source: 'guito-auth-popup-handoff', code: 'abc', state: pkce.state });

      const target = new URL((await startPromise)!, 'https://app.example.com');
      expect(target.pathname).toBe('/auth/callback');
      expect(target.searchParams.get('sessionError')).toBe(marker);
      expect(target.searchParams.get('code')).toBe('abc');
      expect(assign).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
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
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.has('include_granted_scopes')).toBe(false);
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
    expect(fetchMock).toHaveBeenCalledWith(
      EXCHANGE_URL,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Guito-Session': '1' },
      }),
    );
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

    await expect(auth.completeSignIn({ code: 'abc', state: 'forged-state' })).rejects.toThrowError(
      /state/i,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(storage['guito.auth.session']).toBeUndefined();
  });

  it('rejects a stale callback (no pending state) with StaleSignInError (issue #57)', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);

    await expect(
      auth.completeSignIn({ code: 'already-spent', state: 'whatever' }),
    ).rejects.toThrowError(StaleSignInError);
    // Every variant — spent code, Google error redirect, bare callback —
    // recovers the same way instead of a dead-end error card.
    await expect(auth.completeSignIn({})).rejects.toThrowError(StaleSignInError);
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
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'code was already redeemed',
            }),
            { status: 400 },
          ),
      ),
    );

    await expect(auth.completeSignIn({ code: 'abc', state: pkce.state })).rejects.toThrowError(
      /invalid_grant/,
    );
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

    await expect(auth.completeSignIn({ code: 'abc', state: pkce.state })).rejects.toThrowError(
      /502/,
    );
  });
});

describe('AuthService.signOut', () => {
  it('clears local state immediately and logs out only the device cookie session', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    await auth.completeSignIn({ code: 'abc', state: pkce.state });
    expect(auth.isAuthenticated()).toBe(true);

    const redirect = auth.signOut();

    expect(redirect).toBe('/signin');
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.session()).toBeNull();
    expect(storage['guito.auth.session']).toBeUndefined();
    const fetchMock = vi.mocked(fetch);
    const logoutCall = fetchMock.mock.calls.find(
      ([u]) => u === 'https://api.example.com/Auth/session/logout',
    );
    expect(logoutCall).toBeTruthy();
    const [, init] = logoutCall!;
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Guito-Session': '1' });
    expect(init?.body).toBe('{}');
  });

  it('still signs out locally when the device logout endpoint is unreachable or fails', async () => {
    const storage: Record<string, string> = {};
    const auth = serviceWithStorage(storage);
    await auth.signIn();
    const pkce = JSON.parse(storage['session:guito.auth.pkce']);
    await auth.completeSignIn({ code: 'abc', state: pkce.state });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    expect(auth.signOut()).toBe('/signin');
    expect(auth.isAuthenticated()).toBe(false);
    // The failure must not become an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage['guito.auth.session']).toBeUndefined();
  });

  it('logs out the cookie even when local short-lived tokens are missing', () => {
    const auth = serviceWithStorage({});
    expect(auth.signOut()).toBe('/signin');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/Auth/session/logout',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

it('rejects a pending callback cancelled by another tab logout before issuing an exchange', async () => {
  const storage: Record<string, string> = {};
  const auth = serviceWithStorage(storage);
  await auth.signIn('/expenses/create');
  const pkce = JSON.parse(storage['session:guito.auth.pkce']);
  storage['guito.auth.epoch'] = 'another-tab-logout';
  storage['guito.auth.signed-out'] = '1';
  await expect(auth.completeSignIn({ code: 'late-code', state: pkce.state })).rejects.toThrow(
    StaleSignInError,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(storage['guito.auth.session']).toBeUndefined();
});
