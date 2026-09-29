import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from './shell';
import { routes } from '../app.routes';
import { SESSION_STORAGE_KEY } from '../core/auth/auth-session';

const LIVE_SESSION = {
  idToken: `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({ email: 'jane.doe@example.com', name: 'Jane Doe' }),
  )}.sig`,
  accessToken: 'access-token',
  expiresAt: Date.now() + 60 * 60 * 1000,
};

function setup(session: object | null) {
  const storage: Record<string, string> = {};
  if (session) storage[SESSION_STORAGE_KEY] = JSON.stringify(session);
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
  TestBed.configureTestingModule({
    providers: [provideRouter(routes)],
  });
  return { storage };
}

describe('Shell header auth state', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('ShouldShowAvatarAndHideSignInButton_WhenAuthenticated', () => {
    setup(LIVE_SESSION);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const avatar = fixture.debugElement.query(By.css('[data-testid="header-avatar"]'));
    expect(avatar).not.toBeNull();
    expect(fixture.debugElement.query(By.css('[data-testid="avatar-menu"]'))).not.toBeNull();
    expect(avatar.nativeElement.textContent).toContain('JD');
    expect(fixture.debugElement.queryAll(By.css('a[aria-label="Sign in"]'))).toEqual([]);
  });

  it('ShouldShowSignInButtonAndNoAvatar_WhenUnauthenticated', () => {
    setup(null);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[data-testid="header-avatar"]'))).toBeNull();
    expect(fixture.debugElement.query(By.css('a[aria-label="Sign in"]'))).not.toBeNull();
  });

  it('ShouldClearSessionAndNavigateToSignin_WhenSignOutClicked', async () => {
    const { storage } = setup(LIVE_SESSION);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    fixture.debugElement.query(By.css('[data-testid="header-avatar"]')).nativeElement.click();
    fixture.detectChanges();

    const signOut = fixture.debugElement.query(By.css('[data-testid="sign-out"]'));
    expect(signOut).not.toBeNull();
    signOut.nativeElement.click();
    await fixture.whenStable();

    expect(storage[SESSION_STORAGE_KEY]).toBeUndefined();
    expect(TestBed.inject(Router).url).toBe('/signin');
  });
});
