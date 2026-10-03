import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from './shell';
import { routes } from '../../../app.routes';
import { SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';

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
    setItem: (k: string, v: string) => (storage[k] = v),
    removeItem: (k: string) => delete storage[k],
  });
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding())],
  });
}

describe('Shell nav wiring (issue #47)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setup(LIVE_SESSION);
  });

  afterEach(() => {
    // Global-stub rule (CONVENTIONS testing): never leak stubs past this file — isolate:false.
    vi.unstubAllGlobals();
  });

  it('ShouldLinkAllFourTabsInTheBottomNav_WhenRendered', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const bottomNav = fixture.debugElement.query(By.css('nav[aria-label="Bottom navigation"]'));
    const links = bottomNav.queryAll(By.css('a'));
    const hrefs = links.map((l) => l.nativeElement.getAttribute('href'));
    expect(hrefs).toEqual(['/dashboard', '/', '/budgets', '/settings']);
  });

  it('ShouldLinkAllFourSectionsInTheDesktopNav_WhenRendered', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const desktopNav = fixture.debugElement.query(By.css('nav[aria-label="Main navigation"]'));
    const hrefs = desktopNav.queryAll(By.css('a')).map((l) => l.nativeElement.getAttribute('href'));
    expect(hrefs).toEqual(['/dashboard', '/', '/budgets', '/settings']);
  });

  it('ShouldHighlightBudgetsTab_WhenNavigatedToBudgets', async () => {
    const fixture = TestBed.createComponent(Shell);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/budgets');
    await fixture.whenStable();
    fixture.detectChanges();

    const bottomNav = fixture.debugElement.query(By.css('nav[aria-label="Bottom navigation"]'));
    const links = bottomNav.queryAll(By.css('a'));
    const active = links.filter((l) => l.nativeElement.className.includes('text-primary'));
    expect(active.length).toBe(1);
    expect(active[0].nativeElement.textContent).toContain('Budgets');
    expect(active[0].nativeElement.getAttribute('aria-current')).toBe('page');
  });

  it('ShouldRenderTheBudgetsBlankPageTitle_WhenNavigated', async () => {
    const fixture = TestBed.createComponent(Shell);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/budgets');
    await fixture.whenStable();
    fixture.detectChanges();

    const title = fixture.debugElement.query(By.css('[data-testid="page-title"]'));
    expect(title.nativeElement.textContent).toBe('Budgets');
    expect(title.nativeElement.className).toContain('text-2xl');
  });
});
