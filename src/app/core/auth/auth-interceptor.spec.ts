import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  expiresAt: Date.now() + 60 * 60 * 1000,
};

@Injectable({ providedIn: 'root' })
class TestClient {
  private readonly http = inject(HttpClient);
  get(url: string) {
    return this.http.get(url);
  }
}

const WITH_ENV = new InjectionToken<void>('WITH_ENV');

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
      { provide: WITH_ENV, useValue: undefined },
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

  it('ShouldAttachBearerIdToken_WhenRequestTargetsTheApi', () => {
    const { client, http } = setup(LIVE_SESSION);

    client.get(`${TEST_ENV.apiBaseUrl}/Expense/latest/5`).subscribe();

    const req = http.expectOne(`${TEST_ENV.apiBaseUrl}/Expense/latest/5`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${LIVE_SESSION.idToken}`);
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
