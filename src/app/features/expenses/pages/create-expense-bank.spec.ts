import '@angular/compiler';
import { Component } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { CreateExpensePage } from './create-expense-page';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Eating out' }] };
/** The BankPage accept payload (issue #61) — structurally the ExtractedExpense contract. */
const BANK_PREFILL = { description: 'CONTINENTE ONLINE 8831', amount: 58.93, date: '2026-10-02', category: 'Shopping' };
const CATEGORIES_WITH_SHOPPING = { categories: [{ name: 'Clothing' }, { name: 'Shopping' }, { name: 'Eating out' }] };

@Component({ selector: 'g-empty', template: '' })
class EmptyPage {}

describe('CreateExpensePage — bank prefill (issue #61)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

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
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'expenses/create', component: CreateExpensePage },
        ]),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await harness.navigateByUrl('/');
  });

  afterEach(() => { http.verify(); vi.useRealTimers(); localStorage.removeItem(SESSION_STORAGE_KEY); });

  function el(): HTMLElement {
    return document.querySelector('g-create-expense-page') as HTMLElement;
  }

  it.each(['voicePrefill', 'bankPrefill'])('preserves a known fold instant from %s until Date or Time is edited', async (channel) => {
    const occurredAt = '2026-10-25T01:30:27+00:00';
    await router.navigate(['/expenses/create'], { state: { [channel]: { ...BANK_PREFILL, occurredAt } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const page = el();
    expect(page.querySelector<HTMLInputElement>('[data-testid=time-input]')?.value).toBe('01:30');
    expect(page.querySelector<HTMLInputElement>('[data-testid=date-input]')?.value).toBe('2026-10-25');
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).toMatchObject({ occurredAt, date: '2026-10-25', currency: 'EUR', amount: 58.93 });
    req.flush('retry', { status: 500, statusText: 'Server Error' });
    await new Promise(r => setTimeout(r, 0));
    const time = page.querySelector<HTMLInputElement>('[data-testid=time-input]')!;
    time.value = '01:30';
    time.dispatchEvent(new Event('input'));
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(page.textContent).toContain('occurs twice');
    http.expectNone('https://api.test/Expense');
  });

  it.each(['voicePrefill', 'bankPrefill'])('date-only %s keeps booking/proposal date but captures the current Lisbon time', async channel => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T23:15:42Z'));
    await router.navigate(['/expenses/create'], { state: { [channel]: BANK_PREFILL } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const page = el();
    expect(page.querySelector<HTMLInputElement>('[data-testid=time-input]')?.value).toBe('00:15');
    expect(page.querySelector<HTMLInputElement>('[data-testid=date-input]')?.value).toBe('2026-10-02');
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body.occurredAt).toBe('2026-10-02T00:15:00+01:00');
    req.flush({ id: 'opaque-bank-or-voice-id' });
    await new Promise(r => setTimeout(r, 0));
  });

  it('preserves a supplied positive amount without rounding during prefill', async () => {
    await router.navigate(['/expenses/create'], { state: { bankPrefill: { ...BANK_PREFILL, amount: 58.937 } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    expect(el().querySelector<HTMLInputElement>('[data-testid=amount-input]')?.value).toBe('58,937');
  });

  it('prefills the form from history.state.bankPrefill and preselects the suggested category', async () => {
    await router.navigate(['/expenses/create'], { state: { bankPrefill: BANK_PREFILL } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise((r) => setTimeout(r, 0));
    harness.detectChanges();

    const page = el();
    const amount = page.querySelector<HTMLInputElement>('input[type=number], input[inputmode=decimal]');
    const description = page.querySelector<HTMLInputElement>('input[data-testid=description-input]');
    const select = page.querySelector<HTMLSelectElement>('select');
    expect(amount?.value.replace(',', '.')).toBe('58.93');
    expect(description?.value).toBe('CONTINENTE ONLINE 8831');
    expect(select?.value).toBe('Shopping');
    // the suggested category carries the AI-suggested marker until edited
    expect(page.textContent).toContain('AI suggested');
  });

  it('keeps accept usable when the bank row had no suggested category (manual pick)', async () => {
    await router.navigate(['/expenses/create'], {
      state: { bankPrefill: { ...BANK_PREFILL, category: '' } },
    });
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((r) => setTimeout(r, 0));
    harness.detectChanges();

    const select = el().querySelector<HTMLSelectElement>('select');
    // issue #61: no suggestion -> the dropdown starts EMPTY; user picks manually
    expect(select?.value).toBe('');
    expect(el().textContent).not.toContain('AI suggested');
  });
});