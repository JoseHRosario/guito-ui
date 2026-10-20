import { provideRouter, Router } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';
import { SESSION_STORAGE_KEY } from './auth-session';
import { authInterceptor } from './auth-interceptor';

const TEST_ENV = {
  production: false,
  googleClientId: 'test-client-id',
  apiBaseUrl: 'https://api.example.com',
};

/** Session fixture: expires far in the future so it counts as authenticated. */
const LIVE_SESSION = {
  idToken: 'header.payload.signature',
  accessToken: 'access-token',
  persistent: true,
  sessionExpiresAt: '2099-01-01T00:00:00Z',
  refreshedAt: Date.now(),
  expiresAt: Date.now() + 60 * 60 * 1000,
};

@Injectable({ providedIn: 'root' })
class TestClient {
  private readonly http = inject(HttpClient);
  get(url: string) {
    return this.http.get(url);
  }
}

function setup(session: object | null) {
  const storage: Record<string, string> = {};
  if (session) storage[SESSION_STORAGE_KEY] = JSON.stringify(session);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => (storage[k] = v),
    removeItem: (k: string) => delete storage[k],
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { client: TestBed.inject(TestClient), http: TestBed.inject(HttpTestingController) };
}

describe('authInterceptor', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('ShouldAttachBearerIdTokenAndXGoogleIdtoken_WhenRequestTargetsTheApi', () => {
    const { client, http } = setup(LIVE_SESSION);

    client.get(`${TEST_ENV.apiBaseUrl}/Expense/latest/5`).subscribe();

    const req = http.expectOne(`${TEST_ENV.apiBaseUrl}/Expense/latest/5`);
    // Dual-header human-auth contract (ADR-0003): gateway identity source AND
    // the in-app defense middleware both validate the ID token.
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${LIVE_SESSION.idToken}`);
    expect(req.request.headers.get('x-google-idtoken')).toBe(LIVE_SESSION.idToken);
    http.verify();
  });

  it('ShouldNotAttachAuthorization_WhenRequestIsExternal', () => {
    const { client, http } = setup(LIVE_SESSION);

    client.get('https://accounts.google.com/o/oauth2/v2/auth').subscribe();

    const req = http.expectOne('https://accounts.google.com/o/oauth2/v2/auth');
    expect(req.request.headers.has('Authorization')).toBe(false);
    http.verify();
  });

  it('ShouldNotAttachAuthorization_WhenUnauthenticated', () => {
    const { client, http } = setup(null);

    client.get(`${TEST_ENV.apiBaseUrl}/healthz`).subscribe();

    const req = http.expectOne(`${TEST_ENV.apiBaseUrl}/healthz`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    http.verify();
  });

  it('ShouldNotAttachAuthorization_WhenSessionExpired', () => {
    const expired = { ...LIVE_SESSION, expiresAt: Date.now() - 1000 };
    const { client, http } = setup(expired);

    client.get(`${TEST_ENV.apiBaseUrl}/healthz`).subscribe();

    const req = http.expectOne(`${TEST_ENV.apiBaseUrl}/healthz`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    http.verify();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([401, 500])(
  'sends a financial mutation only once after HTTP %s; never renews or replays the response',
  (status) => {
    const { http } = setup(LIVE_SESSION);
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    let observedStatus = 0;
    TestBed.inject(HttpClient)
      .post(`${TEST_ENV.apiBaseUrl}/Expense`, { amount: '1.23' })
      .subscribe({
        error: (error) => {
          observedStatus = error.status;
        },
      });
    const request = http.expectOne(`${TEST_ENV.apiBaseUrl}/Expense`);
    expect(request.request.method).toBe('POST');
    request.flush({}, { status, statusText: 'Rejected' });
    expect(observedStatus).toBe(status);
    http.expectNone(`${TEST_ENV.apiBaseUrl}/Expense`);
    expect(transport).not.toHaveBeenCalled();
    http.verify();
  },
);

it('coalesces renewal before concurrent financial requests, then forwards each exactly once with the renewed ID token', async () => {
  const { http } = setup({ ...LIVE_SESSION, expiresAt: 1 });
  let complete!: (response: Response) => void;
  const transport = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal('fetch', transport);
  const client = TestBed.inject(HttpClient);
  client.post(`${TEST_ENV.apiBaseUrl}/Expense`, { amount: '1' }).subscribe();
  client.post(`${TEST_ENV.apiBaseUrl}/BankTransaction/7/match`, { expenseId: 2 }).subscribe();
  http.expectNone(`${TEST_ENV.apiBaseUrl}/Expense`);
  expect(transport).toHaveBeenCalledTimes(1);
  complete(
    new Response(
      JSON.stringify({
        idToken: 'renewed-id',
        accessToken: 'access',
        expiresIn: 3600,
        sessionExpiresAt: '2099-01-01T00:00:00Z',
      }),
    ),
  );
  await vi.waitFor(() => {
    const requests = http.match((request) => request.method === 'POST');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.request.headers.get('Authorization')).toBe('Bearer renewed-id');
      expect(request.request.headers.get('x-google-idtoken')).toBe('renewed-id');
      request.flush({});
    }
  });
  http.verify();
});

it('does not leak tokens to an API-lookalike host', () => {
  const { client, http } = setup(LIVE_SESSION);
  client.get('https://api.example.com.evil.test/Expense').subscribe();
  const req = http.expectOne('https://api.example.com.evil.test/Expense');
  expect(req.request.headers.has('Authorization')).toBe(false);
  req.flush({});
  http.verify();
});

it('preserves a temporary renewal failure in the caller error region without sending the financial request or forcing login', async () => {
  const { http } = setup({ ...LIVE_SESSION, expiresAt: 1 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 503 })),
  );
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  let status = 0;
  TestBed.inject(HttpClient)
    .post(`${TEST_ENV.apiBaseUrl}/Expense`, { amount: '1' })
    .subscribe({
      error: (error) => {
        status = error.status;
      },
    });
  await vi.waitFor(() => expect(status).toBe(503));
  http.expectNone(`${TEST_ENV.apiBaseUrl}/Expense`);
  expect(navigate).not.toHaveBeenCalled();
  expect(TestBed.inject(AuthService).session()?.idToken).toBe(LIVE_SESSION.idToken);
  http.verify();
});

it('attaches the same ID token to relative same-API-origin requests', () => {
  vi.stubGlobal('location', { origin: TEST_ENV.apiBaseUrl });
  const { client, http } = setup(LIVE_SESSION);
  client.get('/Expense/7').subscribe();
  const req = http.expectOne('/Expense/7');
  expect(req.request.headers.get('Authorization')).toBe(`Bearer ${LIVE_SESSION.idToken}`);
  expect(req.request.headers.get('x-google-idtoken')).toBe(LIVE_SESSION.idToken);
  req.flush({});
  http.verify();
});
