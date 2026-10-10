import '@angular/compiler';
import { NgZone } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { routes } from './app.routes';
import { serializeSession, SESSION_STORAGE_KEY } from './core/auth/auth-session';
import { ExpenseApi } from './features/expenses/services/expense-api';
import { STUB_EXPENSES } from './features/expenses/services/stub-expenses';

afterEach(() => localStorage.removeItem(SESSION_STORAGE_KEY));

function seedSession(): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    serializeSession({ idToken: 'id', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
  );
}

/** Fake of the live API: the shell specs test rendering, not the HTTP layer. */
const FAKE_EXPENSE_API = { provide: ExpenseApi, useValue: { latest: async () => STUB_EXPENSES } };

describe('App shell + expenses list (stubbed, authed session)', () => {
  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    seedSession();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), FAKE_EXPENSE_API],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await TestBed.inject(NgZone).run(() => router.navigateByUrl('/'));
  });

  it('renders the shell header with the Guito wordmark and the signed-in avatar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Guito');
    expect(el.querySelector('nav[aria-label="Bottom navigation"]')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
    expect(el.querySelector('[data-testid="header-avatar"]')).not.toBeNull();
  });

  it('renders the stubbed expense list grouped by day with formatted amounts', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // jsdom applies no CSS: both mobile and desktop branches render, so everything appears twice.
    const headers = [...el.querySelectorAll('[data-testid="group-header"]')].map((n) => n.textContent?.trim());
    expect(headers.slice(0, 2)).toEqual(['Jan 03, Sunday', 'Jan 02, Saturday']);
    expect(headers.length).toBe(4);
    const rows = el.querySelectorAll('[data-testid="expense-row"]');
    expect(rows.length).toBe(14);
    expect(el.textContent).toContain('65,55');
    // Issue #47: no summary bar on the Expenses page — it returns on Dashboard later.
    expect(el.querySelector('[data-testid="summary-expense"]')).toBeNull();
  });
});

describe('App behind the auth gate (ADR-0011, unauthenticated)', () => {
  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter(routes)] }).compileComponents();
    const router = TestBed.inject(Router);
    await TestBed.inject(NgZone).run(() => router.navigateByUrl('/'));
  });

  it('redirects / to /signin: bare sign-in screen, no shell chrome, no list', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toContain('/signin');
    expect(el.querySelector('[data-testid="signin-button"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="expense-row"]')).toBeNull();
    // Auth screens render outside the shell chrome (header/nav/footer), per the Figma frames.
    expect(el.querySelector('footer')).toBeNull();
    expect(el.querySelector('nav[aria-label="Bottom navigation"]')).toBeNull();
  });
});
