import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { ExpensesPage } from './expenses-page';
import { TitlePage } from '../../../shared/title-page';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ChangeDetectorRef } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExpensesRouteReuseStrategy } from '../../../core/route-reuse/expenses-reuse-strategy';
import { routes } from '../../../app.routes';
import { Shell } from '../../shell/components/shell';
import { appConfig } from '../../../app.config';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const API_RESPONSE = {
  expenses: [
    { storedOrder: 12, date: '2021-01-03T10:12:00', amount: 65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' },
  ],
};

describe('Expenses page survives tab navigation (issue #47 follow-up)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        provideRouter(
          routes,
          withComponentInputBinding(),
        ),
        { provide: RouteReuseStrategy, useExisting: ExpensesRouteReuseStrategy },
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  });

  async function landOnExpenses(): Promise<void> {
    // The root outlet ALWAYS renders the Shell layout; the Expenses page is a child outlet.
    await harness.navigateByUrl('/', Shell);
    const req = http.expectOne('https://api.test/Expense/latest/20');
    req.flush(API_RESPONSE);
    harness.detectChanges();
  }

  it('ShouldNotReissueTheLatestRequest_WhenUserLeavesAndReturnsToTheExpensesTab', async () => {
    await landOnExpenses();
    await harness.navigateByUrl('/budgets', Shell);
    await harness.navigateByUrl('/', Shell);

    // No second GET /Expense/latest/20 — the detached component was reused.
    http.expectNone('https://api.test/Expense/latest/20');
    expect(harness.fixture.nativeElement.querySelector('[data-testid="expense-row"]')).not.toBeNull();
  });

  it('ShouldReissueTheLatestRequest_WhenTheRefreshButtonIsClicked', async () => {
    await landOnExpenses();

    // The harness's root-level detectChanges does NOT refresh the detached
    // OnPush child after a signal write (zoneless-test quirk) — drive CD at the
    // child and assert state, falling back to DOM only after child-level CD.
    const pageDebug = harness.fixture.debugElement.query(By.css('g-expenses-page'));
    const pageInstance = pageDebug.componentInstance as {
      refreshing(): boolean;
      refresh(): void;
    };
    const refreshBtn = pageDebug.query(By.css('button[aria-label="Refresh expenses"]'));
    expect(refreshBtn).not.toBeNull();

    // Let the initial load settle, then click.
    await vi.waitFor(() => expect(pageInstance.refreshing()).toBe(false));
    expect(refreshBtn.nativeElement.disabled).toBe(false);
    refreshBtn.nativeElement.click();
    expect(pageInstance.refreshing()).toBe(true);

    // In-flight: icon swapped for the spinner, button disabled (favorite-pill pattern).
    pageDebug.injector.get(ChangeDetectorRef).markForCheck();
    harness.detectChanges();
    expect(pageDebug.nativeElement.querySelector('[data-testid="refresh-spinner"]')).not.toBeNull();
    expect(refreshBtn.nativeElement.disabled).toBe(true);

    const req = http.expectOne('https://api.test/Expense/latest/20');
    req.flush(API_RESPONSE);
    await vi.waitFor(() => expect(pageInstance.refreshing()).toBe(false));

    // Settled: spinner gone, button enabled again.
    pageDebug.injector.get(ChangeDetectorRef).markForCheck();
    harness.detectChanges();
    expect(pageDebug.nativeElement.querySelector('[data-testid="refresh-spinner"]')).toBeNull();
    expect(pageDebug.query(By.css('button[aria-label="Refresh expenses"]')).nativeElement.disabled).toBe(false);
  });

  it('ShouldDetachTheExpensesComponent_WhenAnotherTabActivates', async () => {
    await landOnExpenses();
    await harness.navigateByUrl('/budgets', Shell);
    expect(ExpensesRouteReuseStrategy.hasDetachedRoute()).toBe(true);
  });

  it('ShouldWireTheReuseStrategy_IntoTheRealAppConfig', () => {
    // Regression guard: the strategy must be provided in the real app config,
    // not only in specs — a missing provider silently falls back to BaseRouteReuseStrategy
    // (found live on staging: tab switches re-issued the request).
    const wired = (appConfig.providers as Array<{ provide?: unknown }>).some(
      (provider) => provider?.provide === RouteReuseStrategy,
    );
    expect(wired).toBe(true);
  });
});
