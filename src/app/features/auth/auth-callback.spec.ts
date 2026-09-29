import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthError, AuthService } from '../../core/auth/auth-service';
import { AuthCallback } from './auth-callback';

const auth = {
  completeSignIn: vi.fn(async () => '/expenses'),
  signIn: vi.fn(async () => {}),
};

beforeEach(() => {
  auth.completeSignIn.mockClear().mockResolvedValue('/expenses');
  auth.signIn.mockClear();
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
  it('exchanges the code and routes to the returnUrl', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await create({ code: 'abc', state: 'st' });
    expect(auth.completeSignIn).toHaveBeenCalledWith({ code: 'abc', state: 'st' });
    expect(navigate).toHaveBeenCalledWith('/expenses');
  });

  it('shows the Google error and does not exchange the code', async () => {
    const fixture = await create({ error: 'access_denied' });
    expect(auth.completeSignIn).not.toHaveBeenCalled();
    expect(fixture.componentInstance.message()).toMatch(/access_denied/);
  });

  it('shows the error message when the exchange fails', async () => {
    auth.completeSignIn.mockRejectedValue(new AuthError('Sign-in state mismatch — possible CSRF, restarting sign-in'));
    const fixture = await create({ code: 'abc', state: 'st' });
    expect(fixture.componentInstance.message()).toMatch(/state mismatch/i);
  });

  it('offers retry via signIn on failure', async () => {
    auth.completeSignIn.mockRejectedValue(new AuthError('Google token endpoint rejected the exchange (HTTP 400)'));
    const fixture = await create({ code: 'abc', state: 'st' });
    fixture.componentInstance.retry();
    expect(auth.signIn).toHaveBeenCalledWith('/');
  });

  it('renders the error card with retry on exchange failure (template-level)', async () => {
    auth.completeSignIn.mockRejectedValue(new AuthError('Sign-in state mismatch — possible CSRF, restarting sign-in'));
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
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
