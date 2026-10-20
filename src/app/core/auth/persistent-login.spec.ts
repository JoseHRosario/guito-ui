import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';
import { SESSION_STORAGE_KEY } from './auth-session';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem('guito.auth.signed-out');
  localStorage.removeItem('guito.auth.epoch');
});

it('renews expired persistent tokens once for concurrent foreground users, without exposing a refresh token', async () => {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ persistent: true, idToken: 'old', accessToken: 'old', expiresAt: 1 }),
  );
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          idToken: 'fresh',
          accessToken: 'access',
          expiresIn: 3600,
          sessionExpiresAt: '2099-01-01T00:00:00Z',
        }),
      ),
  );
  vi.stubGlobal('fetch', transport);
  TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test' } }],
  });
  const auth = TestBed.inject(AuthService);
  expect(await Promise.all([auth.ensureSession(), auth.ensureSession()])).toEqual([true, true]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledWith(
    'https://api.test/Auth/session/refresh',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Guito-Session': '1' },
      body: '{}',
    }),
  );
  expect(auth.session()?.idToken).toBe('fresh');
  expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('refreshToken');
});

function expiredSession(): string {
  return JSON.stringify({
    persistent: true,
    idToken: 'old',
    accessToken: 'old-access',
    expiresAt: 1,
  });
}
function setup(transport: typeof fetch): AuthService {
  vi.stubGlobal('fetch', transport);
  localStorage.setItem(SESSION_STORAGE_KEY, expiredSession());
  TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test' } }],
  });
  return TestBed.inject(AuthService);
}
function renewed(): Response {
  return new Response(
    JSON.stringify({
      idToken: 'renewed',
      accessToken: 'access',
      expiresIn: 3600,
      sessionExpiresAt: '2099-01-01T00:00:00Z',
    }),
  );
}

it.each([502, 503])(
  'preserves persistent credentials after HTTP %s and retries on explicit next use',
  async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status }))
      .mockResolvedValueOnce(renewed());
    const auth = setup(transport);
    await expect(auth.ensureSession()).rejects.toThrow(/try again/);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(expiredSession());
    expect(await auth.ensureSession()).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

it('preserves credentials when offline, but definitively expired sessions require login', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'session_expired' }), { status: 401 }),
    );
  const auth = setup(transport);
  await expect(auth.ensureSession()).rejects.toThrow(/connection/);
  expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(expiredSession());
  expect(await auth.ensureSession()).toBe(false);
  expect(auth.session()).toBeNull();
  expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
});

it('never resurrects local auth after logout races an in-flight renewal', async () => {
  let finish!: (response: Response) => void;
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(new Response(null, { status: 204 }));
  const auth = setup(transport);
  const renewal = auth.ensureSession();
  expect(auth.signOut()).toBe('/signin');
  expect(auth.session()).toBeNull();
  finish(renewed());
  expect(await renewal).toBe(false);
  expect(await auth.ensureSession()).toBe(false);
  expect(auth.session()).toBeNull();
  expect(localStorage.getItem('guito.auth.signed-out')).toBe('1');
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    'https://api.test/Auth/session/refresh',
    'https://api.test/Auth/session/logout',
  ]);
});

it('a signed-out marker blocks renewal after an offline logout and new service bootstrap', async () => {
  localStorage.setItem('guito.auth.signed-out', '1');
  const transport = vi.fn<typeof fetch>();
  const auth = setup(transport);
  expect(await auth.ensureSession()).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});

it('requires one fresh login for legacy token-only installations even with an unexpired ID token', async () => {
  const transport = vi.fn<typeof fetch>();
  const auth = setup(transport);
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ idToken: 'legacy', accessToken: 'legacy', expiresAt: Date.now() + 3600000 }),
  );
  expect(await auth.ensureSession()).toBe(false);
  expect(auth.isAuthenticated()).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});

it('consults the server for abandoned cache even when its ID-token expiry is in the future', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 }));
  const auth = setup(transport);
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      persistent: true,
      idToken: 'future',
      accessToken: 'future',
      expiresAt: Date.now() + 3600000,
      refreshedAt: 1,
      sessionExpiresAt: '2099-01-01T00:00:00Z',
    }),
  );
  expect(await auth.ensureSession()).toBe(false);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not extend inactivity expiry from a background tab', async () => {
  const auth = setup(vi.fn<typeof fetch>());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    await expect(auth.ensureSession()).rejects.toThrow(/Return to Guito/);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});

it('accepts only a complete new session response, preserving retryability for malformed success', async () => {
  const auth = setup(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ idToken: 'id', accessToken: 'at', expiresIn: 3600 })),
      ),
  );
  await expect(auth.ensureSession()).rejects.toThrow(/malformed/);
  expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(expiredSession());
});
