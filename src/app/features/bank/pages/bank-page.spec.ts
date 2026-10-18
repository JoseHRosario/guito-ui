import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseApi } from '../../expenses/services/expense-api';
import { BankPage } from './bank-page';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const PENDING = [
  { id: 7, bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', remittanceInformation: 'CONTINENTE ONLINE 8831', status: 'BOOK', reviewStatus: 'needsReview', suggestedCategory: { id: 3, name: 'Shopping' } },
  { id: 8, bookingDate: '2026-10-02', amount: '12.4', currency: 'EUR', remittanceInformation: 'MB WAY PURCHASE 4477 LISBOA', status: 'BOOK', reviewStatus: 'ignored', suggestedCategory: { id: 2, name: 'Eating out' } },
  { id: 9, bookingDate: '2026-10-01', amount: '200', currency: 'EUR', remittanceInformation: 'TRF MB WAY PARA MARIA S', status: 'BOOK', reviewStatus: 'matched', suggestedCategory: null, linkedExpense: { id: 12, bookingDate: '2026-10-01T23:30:00+00:00', amount: '200', currency: 'EUR', description: 'Expense paid', category: 'Bills' } },
];

function setup(): HttpTestingController {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    serializeSession({ idToken: 'id-token', accessToken: 'access', persistent: true, sessionExpiresAt: '2099-01-01T00:00:00Z', refreshedAt: Date.now(), expiresAt: Date.now() + 3_600_000 }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ExpenseApi, useValue: { history: async () => ({ expenses: [], hasMore: false }) } },
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

function flushPending(http: HttpTestingController, rows: object = PENDING): void {
  http.expectOne('https://api.test/BankTransaction').flush(rows);
}

/** Wait a macrotask so the page's own async chain advances before the next expectOne. */
async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

/** Empty pending list: flush the pending GET, wait for the lazy link probe, flush it. */
async function flushUnlinked(http: HttpTestingController, accounts: object[] = []): Promise<void> {
  flushPending(http, []);
  await tick();
  http.expectOne('https://api.test/BankConnection').flush({ accounts });
  await tick();
}

describe('BankPage (issue #61)', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    http = setup();
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(SESSION_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('starts collapsed and expands exactly one row on click, then collapses on a second click', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = el.querySelectorAll<HTMLButtonElement>('[data-testid=bank-row-toggle]');
    expect(toggles).toHaveLength(3);
    expect([...toggles].every(button => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    toggles[0].click(); fixture.detectChanges();
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    toggles[1].click(); fixture.detectChanges();
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('true');
    toggles[1].click(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-details]')).toBeNull();
  });

  it('shows the clean factual no-suggestions panel without bank status or currency commentary', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click();
    fixture.detectChanges();

    const panel = el.querySelector('[data-testid=bank-details]')!;
    expect(panel.textContent).toContain('No suggested matches');
    expect(panel.textContent).not.toContain('BOOK');
    expect(panel.textContent).not.toContain('Currency: EUR');
    expect(panel.textContent).not.toContain('CONTINENTE ONLINE 8831');
    expect(panel.textContent).not.toContain('Suggested category');
  });

  it('renders the bank schema maximum amount without losing its cents', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http, [{ ...PENDING[0], amount: '9999999999999999.99' }]);
    await tick();
    fixture.detectChanges();

    const amount = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=bank-amount]')!;
    expect(amount.textContent?.replace(/[\u00a0\u202f]/g, ' ').trim()).toBe('-9 999 999 999 999 999,99 €');
  });

  it('loads the inbox in a single card with booking day and review status', async () => {
    const fixture = TestBed.createComponent(BankPage);
    const load = http.expectOne('https://api.test/BankTransaction');
    load.flush(PENDING);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('[data-testid=bank-row]'));
    expect(rows.length).toBe(3);
    expect((rows[0].textContent ?? '')).toContain('MB WAY PURCHASE 4477 LISBOA');
    expect((rows[1].textContent ?? '')).toContain('CONTINENTE ONLINE 8831');
    expect((rows[2].textContent ?? '')).toContain('TRF MB WAY PARA MARIA S');
    // amount rendering (testid assertion per CONVENTIONS.md)
    const amount = el.querySelector('[data-tx-id="7"] [data-testid=bank-amount]');
    expect(amount?.textContent?.trim()).toMatch(/^-58,93[ .\u00a0\u202f]€$/);
    // desktop sidebar stub widget (both branches render in jsdom)
    expect(el.querySelector('aside')).toBeNull();
  });

  it('empty pending list shows the empty state card and, when unlinked, the Bank connection section with Open Settings', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = (fixture.nativeElement as HTMLElement);
    const empty = el.querySelectorAll('[data-testid=bank-empty]');
    expect(empty.length).toBe(1); // both responsive branches render in jsdom
    for (const card of Array.from(empty)) {
      expect(card.querySelector('[data-testid=bank-not-linked]')!.textContent!.trim()).toBe(
        'No bank connected — open Settings to link your bank.',
      );
      expect(card.querySelector('[data-testid=open-settings]')).not.toBeNull();
    }
  });

  it('empty pending list with a linked account shows the plain empty state (no Open Settings)', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http, [{ name: 'Conta Casa', ibanMasked: '•••• 1234' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=open-settings]')).toBeNull();
  });

  it('Open Settings routes to /settings — linking lives on Settings (issue #64)', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=open-settings]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('a 409 on the pending GET also implies no bank connection (issue #64)', async () => {
    const fixture = TestBed.createComponent(BankPage);
    http.expectOne('https://api.test/BankTransaction').flush({ title: 'No bank connection' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement);
    expect(el.querySelector('[data-testid=bank-not-linked]')).not.toBeNull();
    expect(el.querySelector('[data-testid=bank-error]')).toBeNull();
  });

  it('landing via ?linked=N shows the consent confirmation above the pending list', async () => {
    const fixture = TestBed.createComponent(BankPage);
    fixture.componentRef.setInput('linked', '1');
    flushPending(http, [PENDING[0]]);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = (fixture.nativeElement as HTMLElement);
    const confirms = el.querySelectorAll('[data-testid=bank-linked-confirm]');
    expect(confirms.length).toBe(1); // both responsive branches render in jsdom
    expect(confirms[0].textContent).toContain('Bank connected — 1 account linked.');
    expect(el.querySelector('[data-testid=bank-row]')).not.toBeNull();
  });

  it('a 0-account callback landing (?linked=0) renders NO success banner (review regression)', async () => {
    const fixture = TestBed.createComponent(BankPage);
    fixture.componentRef.setInput('linked', '0');
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = (fixture.nativeElement as HTMLElement);
    expect(el.querySelector('[data-testid=bank-linked-confirm]')).toBeNull();
    // the probe drives the unlinked empty state instead
    expect(el.querySelector('[data-testid=bank-not-linked]')).not.toBeNull();
  });

  it('sync 409 surfaces "No bank connected — open Settings to link your bank", never "Sync failed"', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    http
      .expectOne('https://api.test/BankTransaction/sync')
      .flush({ title: 'No bank connection' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el = (fixture.nativeElement as HTMLElement);
    const results = el.querySelectorAll('[data-testid=sync-result]');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].textContent!.trim()).toBe('No bank connected — open Settings to link your bank.');
    expect(el.textContent).not.toContain('Sync failed');
    expect(el.querySelector('[data-testid=open-settings]')).not.toBeNull();
  });

  it('expired consent during Sync keeps existing transactions and offers Open Settings', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    http.expectOne('https://api.test/BankTransaction/sync').flush({}, { status: 409, statusText: 'Conflict' });
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(3);
    expect(el.querySelector('[data-testid=open-settings]')).not.toBeNull();
  });

  it('a non-409 sync failure keeps the generic message', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne('https://api.test/BankTransaction/sync').flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=sync-result]')!.textContent!.trim()).toBe(
      'Sync failed — try again',
    );
  });

  it('the sync button disables and swaps to a spinner while the sync is in flight', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    await fixture.whenStable();
    const inFlight = http.expectOne('https://api.test/BankTransaction/sync');
    // not flushed yet: the button must be disabled with the spinner visible
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('[data-testid=sync-bank]');
    expect(button!.disabled).toBe(true);
    expect(el.querySelector('[data-testid=sync-spinner]')).not.toBeNull();
    inFlight.flush({ fetched: 12, new: 3 });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    // the post-sync reload re-issues the lazy link probe on an empty list
    flushPending(http, []);
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne('https://api.test/BankConnection').flush({ accounts: [] });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=sync-spinner]')).toBeNull();
  });

  it('sync button POSTs /BankTransaction/sync then reloads the pending list', async () => {
    const fixture = TestBed.createComponent(BankPage);
    await flushUnlinked(http);
    await fixture.whenStable();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=sync-bank]');
    expect(button).not.toBeNull();
    button!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));

    const syncReq = http.expectOne('https://api.test/BankTransaction/sync');
    expect(syncReq.request.method).toBe('POST');
    syncReq.flush({ fetched: 12, new: 3 });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    flushPending(http, PENDING);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('CONTINENTE ONLINE 8831');
    expect(text).toContain('+3 new');
  });

  it('filters All, Needs review, Matched and Ignored locally, with matched expense metadata and no Accept', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=accept-transaction]')).toBeNull();
    const filters = el.querySelectorAll<HTMLButtonElement>('[data-testid=bank-filter]');
    expect(filters).toHaveLength(4);
    expect(filters[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('Expense paid');
    filters[1].click(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(1);
    expect(el.textContent).toContain('Needs review');
    filters[2].click(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(1);
    el.querySelector<HTMLButtonElement>('[data-tx-id="9"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('02/10/2026');
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('Bills');
    expect(el.querySelector('[data-testid=bank-action]')).toBeNull();
    filters[3].click(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(1);
    expect(el.querySelector('[data-testid=bank-details]')).toBeNull();
    http.expectNone('https://api.test/BankTransaction');
  });

  it('ignores a needs-review row once, shows a row spinner, then returns it to review using authoritative DTOs', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!;
    expect(button?.textContent).toContain('Ignore');
    button.click(); button.click(); fixture.detectChanges();
    const ignore = http.expectOne('https://api.test/BankTransaction/7/ignore');
    expect(ignore.request.method).toBe('POST');
    expect(ignore.request.body).toEqual({});
    expect(button.disabled).toBe(true);
    expect(el.querySelector('[data-testid=sync-spinner]')).toBeNull();
    expect(el.querySelector('[data-testid=bank-action-spinner]')).not.toBeNull();
    ignore.flush({ ...PENDING[0], reviewStatus: 'ignored', suggestedCategory: null });
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-action-spinner]')).toBeNull();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).not.toContain('Currency: EUR');
    const reviewButton = el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!;
    expect(reviewButton.textContent).toContain('Return to review');
    reviewButton.click();
    const review = http.expectOne('https://api.test/BankTransaction/7/review');
    expect(review.request.method).toBe('POST');
    expect(review.request.body).toEqual({});
    review.flush(PENDING[0]); await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-action]')?.textContent).toContain('Ignore');
  });

  it.each([400, 404, 500])('preserves the row and error after a failed transition (%s) and lets the user retry', async status => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!.click();
    http.expectOne('https://api.test/BankTransaction/7/ignore').flush({}, { status, statusText: 'Failure' });
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-row-error]')?.textContent).toContain('Could not update');
    expect(el.querySelector('[data-tx-id="7"]')?.textContent).toContain('Needs review');
    expect(el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')?.disabled).toBe(false);
    expect(el.querySelector('[data-testid=bank-action-spinner]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!.click();
    http.expectOne('https://api.test/BankTransaction/7/ignore').flush({ ...PENDING[0], reviewStatus: 'ignored' });
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-row-error]')).toBeNull();
  });

  it.each([false, true])('refreshes authoritative state after 409, preserves rows on refresh failure=%s, and never retries the action', async failRefresh => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!.click();
    http.expectOne('https://api.test/BankTransaction/7/ignore').flush({}, { status: 409, statusText: 'Conflict' });
    await tick(); fixture.detectChanges();
    const refresh = http.expectOne('https://api.test/BankTransaction');
    expect(el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')?.disabled).toBe(true);
    if (failRefresh) refresh.flush({}, { status: 500, statusText: 'Failure' });
    else refresh.flush([{ ...PENDING[0], reviewStatus: 'matched', linkedExpense: PENDING[2].linkedExpense }, PENDING[1], PENDING[2]]);
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(3);
    expect(el.querySelector('[data-testid=bank-row-error]')).not.toBeNull();
    if (failRefresh) {
      expect(el.querySelector('[data-testid=bank-error]')).not.toBeNull();
      el.querySelector<HTMLButtonElement>('[data-testid=bank-retry]')!.click();
      http.expectOne('https://api.test/BankTransaction').flush(PENDING);
      await tick(); fixture.detectChanges();
      expect(el.querySelector('[data-testid=bank-error]')).toBeNull();
    } else {
      expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('Expense paid');
      expect(el.querySelector('[data-testid=bank-action]')).toBeNull();
    }
    http.expectNone('https://api.test/BankTransaction/7/ignore');
  });

  it('serializes refresh and transition, allowing filters to change without overwriting the chosen view', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http); await tick(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')!.click(); fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('[data-testid=sync-bank]')?.disabled).toBe(true);
    el.querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    http.expectNone('https://api.test/BankTransaction/sync');
    el.querySelectorAll<HTMLButtonElement>('[data-testid=bank-filter]')[3].click(); fixture.detectChanges();
    http.expectOne('https://api.test/BankTransaction/7/ignore').flush({ ...PENDING[0], reviewStatus: 'ignored' });
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(2);
    expect(el.querySelector('[data-testid=bank-details]')).toBeNull();
    expect(el.querySelectorAll('[data-testid=bank-filter]')[3].getAttribute('aria-pressed')).toBe('true');
    el.querySelector<HTMLButtonElement>('[data-testid=sync-bank]')!.click();
    http.expectOne('https://api.test/BankTransaction/sync').flush({ fetched: 3, new: 0 });
    await tick(); fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-tx-id="7"] [data-testid=bank-row-toggle]')!.click(); fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('[data-testid=bank-action]')?.disabled).toBe(true);
    http.expectOne('https://api.test/BankTransaction').flush({}, { status: 500, statusText: 'Failure' });
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(2);
    expect(el.querySelector('[data-testid=bank-error]')).not.toBeNull();
  });

  it('load failure keeps the page usable with an error line and the sync button', async () => {
    const fixture = TestBed.createComponent(BankPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=bank-loading]')).not.toBeNull();
    const load = http.expectOne('https://api.test/BankTransaction');
    load.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=bank-error]')).not.toBeNull();
    expect(el.querySelector('[data-testid=sync-bank]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid=bank-retry]')!.click();
    flushPending(http); await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=bank-row]')).toHaveLength(3);
    expect(el.querySelector('[data-testid=bank-error]')).toBeNull();
  });
});
