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

const TEST_ENV = { expenseTimestampsEnabled: true, apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Eating out' }] };
/** The Bank-origin form prefill (#135) — structurally the ExtractedExpense contract. */
const BANK_PREFILL = { description: 'CONTINENTE ONLINE 8831', amount: '58.93', date: '2026-10-02', category: 'Shopping' };
const CATEGORIES_WITH_SHOPPING = { categories: [{ name: 'Clothing' }, { name: 'Shopping' }, { name: 'Eating out' }] };

@Component({ selector: 'g-empty', template: '' })
class EmptyPage {}

describe('CreateExpensePage — bank create-and-match (#135) and shared prefill semantics', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', persistent: true, sessionExpiresAt: '2099-01-01T00:00:00Z', refreshedAt: Date.now(), expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'bank', component: EmptyPage },
          { path: 'expenses/create', component: CreateExpensePage, canDeactivate: [(page: CreateExpensePage) => page.canLeave()] },
        ]),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await harness.navigateByUrl('/');
  });

  afterEach(() => { sessionStorage.clear(); http.verify(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(SESSION_STORAGE_KEY); });

  function el(): HTMLElement {
    return document.querySelector('g-create-expense-page') as HTMLElement;
  }

  it('saves Bank context atomically, suppresses duplicate taps and returns to Bank', async () => {
    await router.navigate(['/expenses/create'], { queryParams: { bankTransactionId: '9223372036854775807' }, state: { bankPrefill: { ...BANK_PREFILL, transactionId: '9223372036854775807' } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const save = el().querySelector<HTMLButtonElement>('[data-testid=save-expense]')!;
    save.click(); save.click();
    harness.detectChanges();
    expect(el().querySelector('fieldset')?.disabled).toBe(true);
    expect(await router.navigateByUrl('/bank')).toBe(false);
    http.expectNone('https://api.test/Expense');
    const request = http.expectOne('https://api.test/BankTransaction/9223372036854775807/create-and-match');
    expect(request.request.body).toMatchObject({ amount: '58.93', description: BANK_PREFILL.description, category: 'Shopping' });
    expect(request.request.body).not.toHaveProperty('operationId');
    request.flush('{"id":9223372036854775807,"reviewStatus":"matched","linkedExpense":{"id":123,"bookingDate":"2026-10-02","amount":"58.93","currency":"EUR","description":"Purchase","category":"Shopping"}}');
    await new Promise(r => setTimeout(r, 0));
    expect(router.url).toContain('/bank');
  });

  async function openBank(): Promise<void> {
    await router.navigate(['/expenses/create'], { queryParams: { bankTransactionId: '7' }, state: { bankPrefill: { ...BANK_PREFILL, transactionId: '7' } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0)); harness.detectChanges();
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  function click(text: string): void {
    const button = [...el().querySelectorAll('button')].find(button => button.textContent?.trim() === text)!;
    button.click();
  }
  it('checks current Bank after an uncertain write and permits only checks or Return to Bank', async () => {
    await openBank();
    click('Save Expense');
    http.expectOne('https://api.test/BankTransaction/7/create-and-match').flush('', { status: 502, statusText: 'Unknown' });
    await tick();
    const get = http.expectOne('https://api.test/BankTransaction');
    expect(await router.navigateByUrl('/bank')).toBe(false);
    get.flush('[{"id":7,"reviewStatus":"needsReview"}]');
    await tick(); harness.detectChanges();
    expect(el().textContent).toContain('Outcome unknown');
    expect(el().textContent).not.toContain('Retry same operation');
    expect(el().querySelector('fieldset')?.disabled).toBe(false);
    expect(el().querySelector<HTMLButtonElement>('[data-testid=save-expense]')?.disabled).toBe(true);
    const exit = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(exit);
    expect(exit.defaultPrevented).toBe(false);
    click('Check again'); click('Check again');
    http.expectOne('https://api.test/BankTransaction').flush('', { status: 500, statusText: 'Unavailable' });
    await tick(); harness.detectChanges();
    expect(el().textContent).toContain('Outcome unknown');
    http.expectNone(request => request.method === 'POST');
    click('Return to Bank'); await tick();
    expect(router.url).toBe('/bank');
  });

  it('returns to current linked expense after readback without claiming this Save succeeded', async () => {
    await openBank(); click('Save Expense');
    http.expectOne('https://api.test/BankTransaction/7/create-and-match').error(new ProgressEvent('error'));
    await tick();
    http.expectOne('https://api.test/BankTransaction').flush('[{"id":7,"reviewStatus":"matched","linkedExpense":{"id":456,"description":"Authoritative current","bookingDate":"2026-10-02","amount":"58.93","currency":"EUR","category":"Shopping"}}]');
    await tick();
    expect(router.url).toBe('/bank');
    http.expectNone(request => request.method === 'POST');
  });

  it.each([
    { id: 7 },
    { id: 7, reviewStatus: 'needsReview' },
    { id: 7, reviewStatus: 'matched', linkedExpense: {} },
    ...['123', 2147483648, 1.5, 0, 9007199254740992].map(id => ({ id: 7, reviewStatus: 'matched', linkedExpense: { id, bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', description: 'Purchase', category: 'Shopping' } })),
  ])('keeps malformed create response and current link uncertain: %j', async response => {
    await openBank(); click('Save Expense');
    http.expectOne('https://api.test/BankTransaction/7/create-and-match').flush(JSON.stringify(response));
    await tick();
    http.expectOne('https://api.test/BankTransaction').flush(JSON.stringify([{ id: 7, reviewStatus: 'matched', linkedExpense: {} }]));
    await tick(); harness.detectChanges();
    expect(router.url).toContain('/expenses/create');
    expect(el().textContent).toContain('Outcome unknown');
    expect(el().querySelector<HTMLInputElement>('[data-testid=description-input]')?.value).toBe(BANK_PREFILL.description);
    expect(el().querySelector<HTMLButtonElement>('[data-testid=save-expense]')?.disabled).toBe(true);
    click('Check again');
    http.expectOne('https://api.test/BankTransaction').flush(JSON.stringify([response]));
    await tick(); harness.detectChanges();
    expect(router.url).toContain('/expenses/create');
    click('Save Expense');
    http.expectNone(request => request.method === 'POST');
  });

  it('reload marker checks current state without persisting submitted edits or permitting another submit', async () => {
    sessionStorage.setItem('guito.bank-create.7', JSON.stringify({ transactionId: '7', prefill: BANK_PREFILL, submitted: true }));
    await router.navigateByUrl('/expenses/create?bankTransactionId=7');
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    http.expectOne('https://api.test/BankTransaction').flush('[]');
    await tick(); harness.detectChanges();
    click('Save Expense');
    http.expectNone(request => request.method === 'POST');
    expect(el().textContent).toContain('Outcome unknown');
    click('Return to Bank'); await tick();
    expect(router.url).toBe('/bank');
  });
  it.each([400, 404, 409, 422])('handles definite %s without uncertain readback or ordinary Expense POST', async status => {
    await openBank();
    (el().querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    http.expectOne('https://api.test/BankTransaction/7/create-and-match').flush('', { status, statusText: 'Rejected' });
    await tick();
    if (status === 422) { http.expectOne('https://api.test/Category').flush(CATEGORIES); await tick(); }
    harness.detectChanges();
    expect(el().querySelector('fieldset')?.disabled).toBe([404, 409].includes(status));
    expect(el().textContent).toContain(status === 422 ? 'Category' : status === 400 ? 'Check the expense values' : status === 404 ? 'missing' : 'changed');
    expect(await router.navigateByUrl('/bank')).toBe(true);
    http.expectNone(request => request.url.includes('/create-and-match/') || request.url.endsWith('/Expense'));
  });
  it('does not send a write if storage becomes unavailable before Save', async () => {
    await openBank();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    (el().querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    await tick(); harness.detectChanges();
    expect(el().textContent).toContain('Saving is blocked');
    http.expectNone(request => request.method === 'POST');
  });

  it('Cancel returns without any financial write', async () => {
    await openBank(); click('Cancel'); await tick();
    expect(router.url).toBe('/bank');
    http.expectNone(request => request.method === 'POST');
  });
  it.each(['0', '9223372036854775808', '1e3', '007', ''])('fails closed for invalid Bank route ID %s', async id => {
    await router.navigate(['/expenses/create'], { queryParams: { bankTransactionId: id } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await tick(); harness.detectChanges();
    expect(el().textContent).toContain('invalid');
    (el().querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    http.expectNone(request => request.method === 'POST');
  });
  it('fails closed when persisted recovery is malformed, without falling back to ordinary create', async () => {
    sessionStorage.setItem('guito.bank-create.7', '{"transactionId":"7","prefill":{}}');
    await router.navigateByUrl('/expenses/create?bankTransactionId=7');
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await tick(); harness.detectChanges();
    expect(el().querySelector('fieldset')?.disabled).toBe(true);
    http.expectNone('https://api.test/Expense');
  });

  it.each(['voicePrefill', 'bankPrefill'])('preserves a known fold instant from %s until Date or Time is edited', async (channel) => {
    const occurredAt = '2026-10-25T01:30:27+00:00';
    await router.navigate(['/expenses/create'], { queryParams: channel === 'bankPrefill' ? { bankTransactionId: '7' } : {}, state: { [channel]: { ...BANK_PREFILL, transactionId: '7', date: occurredAt } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const page = el();
    expect(page.querySelector<HTMLInputElement>('[data-testid=time-input]')?.value).toBe('01:30');
    expect(page.querySelector<HTMLInputElement>('[data-testid=date-input]')?.value).toBe('2026-10-25');
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    const req = http.expectOne(channel === 'bankPrefill' ? 'https://api.test/BankTransaction/7/create-and-match' : 'https://api.test/Expense');
    expect(req.request.body).toMatchObject({ bookingDate: occurredAt, currency: 'EUR', amount: '58.93' });
    req.flush('retry', { status: 400, statusText: 'Bad Request' });
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
    await router.navigate(['/expenses/create'], { queryParams: channel === 'bankPrefill' ? { bankTransactionId: '7' } : {}, state: { [channel]: { ...BANK_PREFILL, transactionId: '7' } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const page = el();
    expect(page.querySelector<HTMLInputElement>('[data-testid=time-input]')?.value).toBe('00:15');
    expect(page.querySelector<HTMLInputElement>('[data-testid=date-input]')?.value).toBe('2026-10-02');
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    const req = http.expectOne(channel === 'bankPrefill' ? 'https://api.test/BankTransaction/7/create-and-match' : 'https://api.test/Expense');
    expect(req.request.body.bookingDate).toBe('2026-10-02T00:15:00+01:00');
    req.flush(channel === 'bankPrefill' ? JSON.stringify({ id: 7, reviewStatus: 'matched', linkedExpense: { id: 123, bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', description: 'Purchase', category: 'Shopping' } }) : { id: 123 });
    await new Promise(r => setTimeout(r, 0));
  });

  it.each([
    ['voicePrefill', '123456789.123456789'], ['bankPrefill', '123456789.123456789'],
    ['voicePrefill', '-123456789.123456789'], ['bankPrefill', '-123456789.123456789'],
    ['voicePrefill', '0'], ['bankPrefill', '0'],
    ['voicePrefill', '9007199254740993'], ['bankPrefill', '9007199254740993'],
  ])('retains exact decimal %s %s and an arbitrary-offset instant through POST', async (channel, exactAmount) => {
    const occurredAt = '2026-07-02T05:45:27.123456+05:30';

    await router.navigate(['/expenses/create'], { queryParams: channel === 'bankPrefill' ? { bankTransactionId: '7' } : {}, state: { [channel]: { ...BANK_PREFILL, transactionId: '7', date: occurredAt, amount: exactAmount } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    const page = el();
    expect(page.querySelector<HTMLInputElement>('[data-testid=amount-input]')?.value).toBe(exactAmount.includes('.') ? exactAmount.replace('.', ',') : `${exactAmount},00`);
    expect(page.querySelector<HTMLInputElement>('[data-testid=date-input]')?.value).toBe('2026-07-02');
    expect(page.querySelector<HTMLInputElement>('[data-testid=time-input]')?.value).toBe('01:15');
    (page.querySelector('[data-testid=save-expense]') as HTMLButtonElement).click();
    const req = http.expectOne(channel === 'bankPrefill' ? 'https://api.test/BankTransaction/7/create-and-match' : 'https://api.test/Expense');
    expect(req.request.body).not.toHaveProperty('occurredAt');
    expect(req.request.body).not.toHaveProperty('date');
    expect(req.request.body).toMatchObject({ bookingDate: occurredAt, amount: exactAmount });
    req.flush(channel === 'bankPrefill' ? JSON.stringify({ id: 7, reviewStatus: 'matched', linkedExpense: { id: 123, bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', description: 'Purchase', category: 'Shopping' } }) : { id: 123 });
    await new Promise(r => setTimeout(r, 0));
  });

  it('preserves a supplied positive amount without rounding during prefill', async () => {
    await router.navigate(['/expenses/create'], { queryParams: { bankTransactionId: '7' }, state: { bankPrefill: { ...BANK_PREFILL, transactionId: '7', amount: '58.937' } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise(r => setTimeout(r, 0));
    harness.detectChanges();
    expect(el().querySelector<HTMLInputElement>('[data-testid=amount-input]')?.value).toBe('58,937');
  });

  it('prefills the form from history.state.bankPrefill and preselects the suggested category', async () => {
    await router.navigate(['/expenses/create'], { queryParams: { bankTransactionId: '7' }, state: { bankPrefill: { ...BANK_PREFILL, transactionId: '7' } } });
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

  it('keeps Create editable when the bank row had no suggested category (manual pick)', async () => {
    await router.navigate(['/expenses/create'], {
      queryParams: { bankTransactionId: '7' }, state: { bankPrefill: { ...BANK_PREFILL, transactionId: '7', category: '' } },
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