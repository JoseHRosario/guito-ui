import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { AuthService } from './auth-service';
import { authGuard } from './auth-guard';
import { serializeSession, SESSION_STORAGE_KEY, type AuthSession } from './auth-session';

import { Component } from '@angular/core';

function validSession(): AuthSession {
  return { idToken: 'id', accessToken: 'access', expiresAt: Date.now() + 3_600_000 };
}

const auth = { isAuthenticated: vi.fn(() => false) };

@Component({ template: '', standalone: true })
class DummyRoute {}

beforeEach(() => {
  auth.isAuthenticated.mockReturnValue(false);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: DummyRoute, canActivate: [authGuard] },
        { path: 'signin', component: DummyRoute },
      ]),
      { provide: AuthService, useValue: auth },
    ],
  });
});

describe('authGuard', () => {
  it('lets authenticated users through', async () => {
    auth.isAuthenticated.mockReturnValue(true);
    const guard = TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/' } as never));
    expect(guard).toBe(true);
  });

  it('redirects unauthenticated visitors to /signin with the original URL as returnUrl', () => {
    const guard = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/expenses?month=1' } as never),
    ) as UrlTree;
    expect(guard.toString()).toContain('/signin');
    expect(guard.queryParams['returnUrl']).toBe('/expenses?month=1');
  });

  it('treats an expired persisted session as unauthenticated', async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ ...validSession(), expiresAt: Date.now() - 1_000 }),
    );
    // Real AuthService: session signal reads localStorage; isExpired forces re-auth.
    const { AuthService: RealAuthService } = await import('./auth-service');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    expect(TestBed.inject(RealAuthService).isAuthenticated()).toBe(false);
  });
});

describe('app routing behind the guard (ADR-0011)', () => {
  it('unauthenticated visits to / land on /signin?returnUrl=/', async () => {
    TestBed.resetTestingModule();
    const { routes } = await import('../../app.routes');
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await TestBed.inject(NgZone).run(() => router.navigateByUrl('/'));
    expect(router.url).toContain('/signin');
    expect(router.url).toContain('returnUrl=%2F');
  });

  it('unauthenticated deep links keep the full URL as returnUrl', async () => {
    TestBed.resetTestingModule();
    const { routes } = await import('../../app.routes');
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await TestBed.inject(NgZone).run(() => router.navigateByUrl('/?month=2'));
    expect(router.url).toContain('returnUrl=');
    expect(decodeURIComponent(router.url)).toContain('returnUrl=/?month=2');
  });
});
