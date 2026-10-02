import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { ExpensesPage } from './expenses-page';
import { CreateExpensePage } from './create-expense-page';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES_RESPONSE = { categories: [{ name: 'Clothing' }, { name: 'Food' }] };

const API_RESPONSE = {
  expenses: [
    { storedOrder: 12, date: '2021-01-03T10:12:00', amount: 65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' },
    { storedOrder: 13, date: '2021-01-02T08:00:00', amount: 30, description: 'Bus pass', category: 'Transportation', creatorEmail: null },
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
        provideRouter([]),
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
    // Summary derived from data (ADR 0010: every Expense is an outflow —
    // amounts stored positive): 65.55 + 30 outflow / 0 income / -95.55 total.
    expect(pageEl.querySelector('[data-testid="summary-expense"]')?.textContent).toContain('95,55');
    expect(pageEl.querySelector('[data-testid="summary-income"]')?.textContent).toContain('0,00');
    expect(pageEl.querySelector('[data-testid="summary-total"]')?.textContent).toContain('-95,55');
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

describe('ExpensesPage — FAB navigation + save toast (issue #32, frame 3094:10243)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ExpensesPage>;

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
        provideRouter([{ path: '', component: ExpensesPage }, { path: 'expenses/create', component: CreateExpensePage }]),
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

  it('FAB opens the speed-dial and its Manual action navigates to /expenses/create', async () => {
    const router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [] });
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="add-expense-fab"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="speed-dial-menu"]')).not.toBeNull();
    (el.querySelector('[data-testid="speed-dial-manual"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(router.url).toBe('/expenses/create'));
  });

  it('desktop Add Expense button also navigates to /expenses/create', async () => {
    const router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [] });
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="add-expense-desktop"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(router.url).toBe('/expenses/create'));
  });

  it('navigating back with saved=1 shows the toast, auto-dismisses ~3s and clears the param', async () => {
    vi.useFakeTimers();
    try {
      const router = TestBed.inject(Router);
      fixture = TestBed.createComponent(ExpensesPage);
      fixture.detectChanges();
      http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [] });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="saved-toast"]')).toBeNull();
      await router.navigateByUrl('/?saved=1');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="saved-toast"]')?.textContent).toContain('Expense saved');
      vi.advanceTimersByTime(3100);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="saved-toast"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ExpensesPage — favorites speed-dial (issue #43, ADR 0012)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ExpensesPage>;

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
        provideRouter([{ path: '', component: ExpensesPage }]),
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

  function renderWithList(): HTMLElement {
    fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [] });
    (el.querySelector('[data-testid="add-expense-fab"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    return el;
  }

  it('tapping the favorite POSTs the preset immediately (positive amount, today) and navigates with saved=1', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const el = renderWithList();

    const favoriteButton = el.querySelector('[data-testid="speed-dial-favorite-morning-coffee"]') as HTMLButtonElement;
    expect(favoriteButton).not.toBeNull();
    favoriteButton.click();
    fixture.detectChanges();

    // in-flight feedback: a spinner joins the label inside the pressed pill
    expect(el.querySelector('[data-testid="favorite-spinner"]')).not.toBeNull();

    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as { amount: number; description: string; date: string; category: string };
    expect(body.amount).toBe(2.3);
    expect(body.description).toBe('Coco Verde');
    expect(body.category).toBe('Eating out');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 77 });
    fixture.detectChanges();

    // The success path refreshes the list in place (component reuse on
    // '/' → '/?saved=1'), so the reload request fires here too. The create
    // promise chain settles in microtasks — await a macrotask first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [] });

    await vi.waitFor(() => expect(navSpy).toHaveBeenCalledWith(['/'], { queryParams: { saved: '1' } }));

    // feedback clears once the create settles (the finally chain runs after navigation)
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="favorite-spinner"]')).toBeNull();
  });

  it('the scrim closes the speed-dial without navigating', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    const el = renderWithList();

    (el.querySelector('[data-testid="speed-dial-scrim"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="speed-dial-menu"]')).toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
    http.expectNone('https://api.test/Expense');
  });

  it('a failed favorite create shows the error card and stays on the list', async () => {
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    const el = renderWithList();

    (el.querySelector('[data-testid="speed-dial-favorite-morning-coffee"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('https://api.test/Expense').flush('nope', { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() =>
      expect(el.querySelector('[data-testid="speed-dial-error"]')?.textContent).toContain('Could not save the expense'),
    );
    fixture.detectChanges();
    expect(navSpy).not.toHaveBeenCalled();
  });
});
