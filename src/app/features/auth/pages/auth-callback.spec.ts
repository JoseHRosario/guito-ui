import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ServiceStartingError } from '../../../core/auth/service-starting-error';
import { AuthError, AuthService, StaleSignInError } from '../../../core/auth/auth-service';
import { AuthCallback } from './auth-callback';

const auth = {
  completeSignIn: vi.fn(async () => '/expenses'),
  signIn: vi.fn<() => Promise<string | undefined>>(async () => undefined),
  pendingReturnUrl: vi.fn(() => '/'),
  ensureSession: vi.fn(async () => true),
};

beforeEach(() => {
  auth.completeSignIn.mockClear().mockResolvedValue('/expenses');
  auth.signIn.mockClear();
  auth.pendingReturnUrl.mockReset().mockReturnValue('/');
  auth.ensureSession.mockReset().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
});

async function create(inputs: Record<string, string>) {
  const fixture = TestBed.createComponent(AuthCallback);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('AuthCallback', () => {
  it('shows service startup and manually retries only the readiness-gated code on the existing card', async () => {
    auth.completeSignIn.mockRejectedValueOnce(
      new ServiceStartingError('The service is starting. Please try again.'),
    );
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = await create({ code: 'abc', state: 'st' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="auth-error"]')?.textContent).toContain(
      'Service starting',
    );
    expect(auth.completeSignIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn).not.toHaveBeenCalled();
    el.querySelector('button')!.click();
    await fixture.whenStable();
    expect(auth.completeSignIn).toHaveBeenCalledTimes(2);
    expect(auth.completeSignIn).toHaveBeenLastCalledWith({ code: 'abc', state: 'st' }, true);
    expect(navigate).toHaveBeenCalledWith('/expenses', { replaceUrl: true });
  });

  it('retains the requested route when uncertain code consumption requires restarting Google', async () => {
    auth.completeSignIn.mockRejectedValue(
      new AuthError('Sign-in timed out. The service may be unavailable.'),
    );
    const fixture = await create({ code: 'abc', state: 'st' });
    auth.pendingReturnUrl.mockReturnValueOnce('/budgets?source=login');
    fixture.componentInstance.retry();
    expect(auth.completeSignIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn).toHaveBeenCalledWith('/budgets?source=login');
  });

  it.each([
    new ServiceStartingError('The service is starting. Please try again.'),
    new AuthError('Session renewal timed out. The service may be unavailable. Please try again.'),
  ])(
    'does not replace a renewal service failure with connectivity wording: %s',
    async (failure) => {
      auth.ensureSession.mockRejectedValueOnce(failure);
      const fixture = TestBed.createComponent(AuthCallback);
      fixture.componentRef.setInput('renew', true);
      await fixture.whenStable();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(failure.message);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Connection failed');
      expect(auth.ensureSession).toHaveBeenCalledTimes(1);
    },
  );
  it('navigates after a user-requested Google restart succeeds in a popup', async () => {
    auth.completeSignIn.mockRejectedValue(new AuthError('Uncertain exchange'));
    const fixture = await create({ code: 'abc', state: 'st' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.signIn.mockResolvedValueOnce('/budgets');
    await fixture.componentInstance.retry();
    expect(navigate).toHaveBeenCalledWith('/budgets', { replaceUrl: true });
  });

  it.each([
    { marker: 'service_starting', message: 'The service is starting. Please try again.' },
    { marker: 'timeout', message: 'Sign-in timed out. The service may be unavailable.' },
    { marker: 'exchange_failed', message: 'Sign-in failed. Please restart with Google.' },
    { marker: 'connectivity', message: 'Could not reach the token exchange endpoint.' },
  ])(
    'renders popup failure $marker without re-exchanging on callback entry',
    async ({ marker, message }) => {
      const fixture = await create({ code: 'abc', state: 'st', sessionError: marker });
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(message);
      expect(auth.completeSignIn).not.toHaveBeenCalled();
      expect(auth.signIn).not.toHaveBeenCalled();
    },
  );

  it('exchanges the code and routes to the returnUrl', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await create({ code: 'abc', state: 'st' });
    expect(auth.completeSignIn).toHaveBeenCalledWith({ code: 'abc', state: 'st' }, false);
    expect(navigate).toHaveBeenCalledWith('/expenses', { replaceUrl: true });
  });

  it('shows the Google error and does not exchange the code', async () => {
    const fixture = await create({ error: 'access_denied' });
    expect(auth.completeSignIn).not.toHaveBeenCalled();
    expect(fixture.componentInstance.message()).toMatch(/access_denied/);
  });

  it('shows the error message when the exchange fails', async () => {
    auth.completeSignIn.mockRejectedValue(
      new AuthError('Sign-in state mismatch — possible CSRF, restarting sign-in'),
    );
    const fixture = await create({ code: 'abc', state: 'st' });
    expect(fixture.componentInstance.message()).toMatch(/state mismatch/i);
  });

  it('offers retry via signIn on failure', async () => {
    auth.completeSignIn.mockRejectedValue(
      new AuthError('Google token endpoint rejected the exchange (HTTP 400)'),
    );
    const fixture = await create({ code: 'abc', state: 'st' });
    fixture.componentInstance.retry();
    expect(auth.signIn).toHaveBeenCalledWith('/');
  });

  it('renders the error card with retry on exchange failure (template-level)', async () => {
    auth.completeSignIn.mockRejectedValue(
      new AuthError('Sign-in state mismatch — possible CSRF, restarting sign-in'),
    );
    const fixture = await create({ code: 'abc', state: 'st' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="auth-error"]')).toBeTruthy();
    expect(el.querySelector('button')?.textContent).toMatch(/try again/i);
    expect(el.querySelector('.loading')).toBeNull();
  });

  it('navigates to / when the returnUrl is not a relative path', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.completeSignIn.mockResolvedValue('https://evil.example.com/steal');
    await create({ code: 'abc', state: 'st' });
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('recovers a stale callback by routing to /signin instead of the error card (issue #57)', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.completeSignIn.mockRejectedValue(
      new StaleSignInError('No sign-in in progress — stale callback'),
    );
    const fixture = await create({ code: 'spent', state: 'st' });
    expect(navigate).toHaveBeenCalledWith('/signin', { replaceUrl: true });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="auth-error"]')).toBeNull();
  });

  it('hands the code to the opener and lets the opener close after accepting the message', async () => {
    const opener = { postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', { configurable: true, value: opener });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    try {
      await create({ code: 'abc', state: 'st' });
      expect(opener.postMessage).toHaveBeenCalledWith(
        { source: 'guito-auth-popup-handoff', code: 'abc', state: 'st', error: '' },
        location.origin,
      );
      expect(auth.completeSignIn).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'opener', { configurable: true, value: null });
      closeSpy.mockRestore();
    }
  });
});
