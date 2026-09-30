import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../core/auth/auth-session';
import { ExpensesPage } from './expenses-page';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const API_RESPONSE = {
  expenses: [
    { storedOrder: 12, date: '2021-01-03T10:12:00', amount: -65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' },
    { storedOrder: 13, date: '2021-01-02T08:00:00', amount: 2500, description: 'Salary', category: 'Income', creatorEmail: null },
  ],
};

describe('ExpensesPage (live API, guito-api#9)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ExpensesPage>;

  function render(): HTMLElement {
    fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function latestRequest(): ReturnType<HttpTestingController['expectOne']> {
    return http.expectOne('https://api.test/Expense/latest/20');
  }

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  });

  it('shows the loading state, then the rows grouped by day with derived summary and month', async () => {
    const pageEl = render();
    expect(pageEl.querySelector('[data-testid="expenses-loading"]')).not.toBeNull();

    latestRequest().flush(API_RESPONSE);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(pageEl.querySelector('[data-testid="expenses-loading"]')).toBeNull();
    });
    // jsdom applies no CSS: mobile + desktop branches render, so groups appear twice.
    const headers = [...pageEl.querySelectorAll('[data-testid="group-header"]')].map((n) => n.textContent?.trim());
    expect(headers.slice(0, 2)).toEqual(['Jan 03, Sunday', 'Jan 02, Saturday']);
    expect(headers.length).toBe(4);
    // Summary derived from data: 65.55 outflow / 2500 income / +2434.45 total.
    expect(pageEl.querySelector('[data-testid="summary-expense"]')?.textContent).toContain('65,55');
    expect(pageEl.querySelector('[data-testid="summary-income"]')?.textContent).toContain('2500,00');
    expect(pageEl.querySelector('[data-testid="summary-total"]')?.textContent).toContain('2434,45');
  });

  it('shows the error card with a retry that re-requests the API', async () => {
    const pageEl = render();
    latestRequest().flush('boom', { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(pageEl.querySelector('[data-testid="expenses-error"]')).not.toBeNull();
    });
    const errorCard = pageEl.querySelector('[data-testid="expenses-error"]');
    expect(errorCard?.textContent).toContain('Could not load your expenses');

    (pageEl.querySelector('[data-testid="expenses-retry"]') as HTMLButtonElement).click();
    latestRequest().flush(API_RESPONSE);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(pageEl.querySelector('[data-testid="expenses-error"]')).toBeNull();
      expect(pageEl.querySelector('[data-testid="expense-row"]')).not.toBeNull();
    });
  });

  it('shows the empty state when the API returns no expenses', async () => {
    const pageEl = render();
    latestRequest().flush({ expenses: [] });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(pageEl.querySelector('[data-testid="expenses-empty"]')).not.toBeNull();
    });
    expect(pageEl.querySelector('[data-testid="expense-row"]')).toBeNull();
    expect(pageEl.querySelector('[data-testid="expenses-error"]')).toBeNull();
  });
});