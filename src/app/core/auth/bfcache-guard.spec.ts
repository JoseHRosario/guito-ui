import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth-service';
import { APP_ENVIRONMENT } from '../app-environment';
import { guardBfcacheRestores } from './bfcache-guard';
import { provideBfcacheGuard } from './bfcache-guard-initializer';

const TEST_ENV = { production: false, googleClientId: 'cid', apiBaseUrl: 'https://api.test' };

const auth = { isAuthenticated: vi.fn(() => false) };

/** Fresh seams per test: pageshow registration recorder + redirect spy. */
function fakeRegistrar(): {
  registered: Array<{ type: string; fire: (event: { persisted: boolean }) => void }>;
  addListener: (type: string, handler: (event: { persisted: boolean }) => void) => void;
} {
  const registered: Array<{ type: string; fire: (event: { persisted: boolean }) => void }> = [];
  return {
    registered,
    addListener: (type, handler) => {
      registered.push({ type, fire: handler });
    },
  };
}

beforeEach(() => {
  auth.isAuthenticated.mockReturnValue(false);
});

afterEach(() => {
  // isolate:false: spies on window.addEventListener must not leak into the
  // next spec file in this worker (CONVENTIONS testing rule, PR #33 lesson).
  vi.restoreAllMocks();
});

describe('guardBfcacheRestores (issue #39)', () => {
  it('redirects to /signin when a bfcache restore lands unauthenticated', () => {
    const registrar = fakeRegistrar();
    const redirect = vi.fn();
    guardBfcacheRestores(auth as unknown as AuthService, redirect, registrar.addListener);

    registrar.registered[0].fire({ persisted: true });

    expect(redirect).toHaveBeenCalledWith('/signin');
  });

  it('does not redirect an authenticated bfcache restore', () => {
    auth.isAuthenticated.mockReturnValue(true);
    const registrar = fakeRegistrar();
    const redirect = vi.fn();
    guardBfcacheRestores(auth as unknown as AuthService, redirect, registrar.addListener);

    registrar.registered[0].fire({ persisted: true });

    expect(redirect).not.toHaveBeenCalled();
  });

  it('ignores ordinary (non-bfcache) pageshow events', () => {
    const registrar = fakeRegistrar();
    const redirect = vi.fn();
    guardBfcacheRestores(auth as unknown as AuthService, redirect, registrar.addListener);

    registrar.registered[0].fire({ persisted: false });

    expect(redirect).not.toHaveBeenCalled();
  });

  it('registers exactly one pageshow listener', () => {
    const registrar = fakeRegistrar();
    guardBfcacheRestores(auth as unknown as AuthService, vi.fn(), registrar.addListener);
    expect(registrar.registered.map((r) => r.type)).toEqual(['pageshow']);
  });
});

describe('provideBfcacheGuard (app initializer wiring)', () => {
  it('registers the pageshow guard on the real window at bootstrap', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    TestBed.configureTestingModule({
      providers: [
        provideBfcacheGuard(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(addEventListener.mock.calls.some(([type]) => type === 'pageshow')).toBe(true);
  });

  it('fires the redirect through the real router when restored unauthenticated', async () => {
    let pageshowHandler: ((event: { persisted: boolean }) => void) | undefined;
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, fn: (event: { persisted: boolean }) => void) => {
      if (type === 'pageshow') pageshowHandler = fn;
    }) as never);
    TestBed.configureTestingModule({
      providers: [
        provideBfcacheGuard(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    // Fire the handler the way the browser does on a bfcache restore.
    pageshowHandler!({ persisted: true } as PageTransitionEvent);
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith('/signin', { replaceUrl: true });
  });
});
