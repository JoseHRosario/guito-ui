import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankPage } from './bank-page';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const PENDING = [
  { id: 7, bookingDate: '2026-10-02', amount: 58.93, currency: 'EUR', remittanceInformation: 'CONTINENTE ONLINE 8831', suggestedCategoryId: 3, suggestedCategory: 'Shopping' },
  { id: 8, bookingDate: '2026-10-02', amount: 12.4, currency: 'EUR', remittanceInformation: 'MB WAY PURCHASE 4477 LISBOA', suggestedCategoryId: 2, suggestedCategory: 'Eating out' },
  { id: 9, bookingDate: '2026-10-01', amount: 200, currency: 'EUR', remittanceInformation: 'TRF MB WAY PARA MARIA S', suggestedCategory: null },
];

function setup(): HttpTestingController {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
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

  it('loads pending transactions and renders date-grouped rows newest first', async () => {
    const fixture = TestBed.createComponent(BankPage);
    const load = http.expectOne('https://api.test/BankTransaction');
    load.flush(PENDING);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // jsdom renders BOTH responsive branches — every testid appears twice.
    const groups = Array.from(el.querySelectorAll('[data-testid=bank-group]'));
    expect(groups.length).toBe(4);
    expect(groups[0].textContent).toContain('02/10/2026');
    expect(groups[1].textContent).toContain('01/10/2026');
    expect(groups[2].textContent).toContain('02/10/2026');
    expect(groups[3].textContent).toContain('01/10/2026');
    const rows = Array.from(el.querySelectorAll('[data-testid=bank-row]'));
    expect(rows.length).toBe(6);
    expect((rows[0].textContent ?? '')).toContain('CONTINENTE ONLINE 8831');
    expect((rows[2].textContent ?? '')).toContain('TRF MB WAY PARA MARIA S');
    // amount rendering (testid assertion per CONVENTIONS.md)
    const amounts = Array.from(el.querySelectorAll('[data-testid=bank-amount]'));
    expect(amounts[0].textContent?.trim()).toMatch(/^58,93[ .\u00a0\u202f]€$/);
    // desktop sidebar stub widget (both branches render in jsdom)
    expect(el.querySelectorAll('[data-testid=sidebar-wallet]')[0].textContent).toContain('+12.450,00 €');
  });

  it('empty pending list shows the empty state card', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http, []);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=bank-empty]')).not.toBeNull();
  });

  it('the sync button disables and swaps to a spinner while the sync is in flight', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http, []);
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
    flushPending(http, []);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=sync-spinner]')).toBeNull();
  });

  it('shows the No suggestion meta for rows without a Jev category', async () => {
    const fixture = TestBed.createComponent(BankPage);
    const load = http.expectOne('https://api.test/BankTransaction');
    load.flush([PENDING[2]]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No suggestion');
  });

  it('sync button POSTs /BankTransaction/sync then reloads the pending list', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http, []);
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

  it('accept navigates to the create form prefilled from the transaction (suggested category included)', async () => {
    const fixture = TestBed.createComponent(BankPage);
    flushPending(http, [PENDING[0]]);
    await fixture.whenStable();
    fixture.detectChanges();

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const accept = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=accept-transaction]');
    expect(accept).not.toBeNull();
    accept!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(navigate).toHaveBeenCalledWith(['/expenses/create'], {
      state: {
        bankPrefill: {
          description: 'CONTINENTE ONLINE 8831',
          amount: 58.93,
          date: '2026-10-02',
          category: 'Shopping',
        },
      },
    });
  });

  it('load failure keeps the page usable with an error line and the sync button', async () => {
    const fixture = TestBed.createComponent(BankPage);
    const load = http.expectOne('https://api.test/BankTransaction');
    load.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=bank-error]')).not.toBeNull();
    expect(el.querySelector('[data-testid=sync-bank]')).not.toBeNull();
  });
});