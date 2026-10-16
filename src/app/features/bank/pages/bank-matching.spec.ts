import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { BankPage } from './bank-page';

const EXPENSES = Array.from({ length: 5 }, (_, i) => ({ id: 20 + i, description: `Candidate ${i}`, amount: '58.93', currency: 'EUR', category: 'Shopping', bookingDate: `2026-10-0${5 - i}T23:30:00+00:00` }));
const ROWS = [
  { id: 7, bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', remittanceInformation: 'Bank row', reviewStatus: 'needsReview', suggestedExpenseCount: 5 },
  { id: 8, bookingDate: '2026-10-01', amount: '58.93', currency: 'EUR', remittanceInformation: 'Other row', reviewStatus: 'needsReview', suggestedExpenseCount: 1 },
  { id: 9, bookingDate: '2026-10-01', amount: '58.93', currency: 'EUR', remittanceInformation: 'Linked row', reviewStatus: 'matched', suggestedExpenseCount: 0, linkedExpense: EXPENSES[4] },
];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Manual matching through rendered component and HTTP (#134)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<BankPage>;
  let el: HTMLElement;
  const button = (selector: string) => el.querySelector<HTMLButtonElement>(selector)!;
  const history = (expenses = EXPENSES, pageIndex = 0, hasMore = false) => http.expectOne(`https://api.test/Expense/history?pageSize=100&pageIndex=${pageIndex}`).flush({ pageSize: 100, pageIndex, totalCount: expenses.length, hasMore, expenses });
  async function start(): Promise<void> {
    fixture = TestBed.createComponent(BankPage); el = fixture.nativeElement;
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history(); await tick(); fixture.detectChanges();
  }
  async function open(id = '7', expenses = EXPENSES): Promise<void> {
    button(`[data-tx-id="${id}"] [data-testid=bank-row-toggle]`).click();
    http.expectOne(`https://api.test/BankTransaction/${id}/suggestions`).flush(expenses);
    await tick(); fixture.detectChanges();
  }
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test', googleClientId: 'test' } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('orders same-day Bank rows by descending numeric Int64 identity without rounding', async () => {
    fixture = TestBed.createComponent(BankPage); el = fixture.nativeElement;
    const response = `[${[
      ['9007199254740992', 'Lower unsafe identity'],
      ['10', 'Ten'],
      ['9007199254740993', 'Higher unsafe identity'],
      ['9', 'Nine'],
    ].map(([id, description]) => JSON.stringify({ ...ROWS[0], id, remittanceInformation: description })
      .replace(`"id":"${id}"`, `"id":${id}`)).join(',')}]`;
    http.expectOne('https://api.test/BankTransaction').flush(response);
    history(); await tick(); fixture.detectChanges();

    const renderedIds = [...el.querySelectorAll<HTMLElement>('[data-tx-id]')]
      .map(row => row.dataset['txId']);

    expect(renderedIds).toEqual(['9007199254740993', '9007199254740992', '10', '9']);
  });

  it('starts collapsed, uses server count and shows first three clean candidates independently of contextual history', async () => {
    await start();
    expect(el.querySelector('[data-testid=bank-details]')).toBeNull();
    expect(el.textContent).toContain('5 suggestions');
    await open();
    const panel = el.querySelector('[data-testid=bank-details]')!;
    expect(panel.querySelectorAll('[data-testid=match-expense]')).toHaveLength(3);
    expect(panel.textContent).not.toContain('BOOK');
    expect(panel.textContent).not.toContain('Currency');
    expect(panel.textContent).toContain('Show more (2)');
    button('[data-testid=show-more-suggestions]').click(); fixture.detectChanges();
    expect(panel.querySelectorAll('[data-testid=match-expense]')).toHaveLength(5);
    expect(el.querySelector('[data-testid=expense-history]')?.textContent).toContain('Suggested');
    expect(el.querySelector('[data-testid=expense-history]')?.querySelector('button[aria-label^="Match"]')).toBeNull();
  });

  it.each([400, 404, 409, 500, 502, 0, 200])('recovers a rejected/unknown response (%s) by reads, never automatically repeats the mutation', async status => {
    await start(); await open(); button('[data-testid=match-expense]').click();
    const req = http.expectOne('https://api.test/BankTransaction/7/match');
    if (status === 0) req.error(new ProgressEvent('error')); else req.flush({}, { status, statusText: 'Failure' });
    await tick();
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history(); await tick();
    http.expectOne('https://api.test/BankTransaction/7/suggestions').flush(EXPENSES);
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-row-error]')?.textContent).toMatch(/review/i);
    expect(button('[data-testid=match-expense]').disabled).toBe(false);
    http.expectNone('https://api.test/BankTransaction/7/match');
  });

  it('does not let an earlier candidate response replace the newly expanded transaction', async () => {
    await start();
    button('[data-tx-id="7"] [data-testid=bank-row-toggle]').click();
    const first = http.expectOne('https://api.test/BankTransaction/7/suggestions');
    await open('8', [EXPENSES[4]]);
    first.flush(EXPENSES); await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=match-expense]')).toHaveLength(1);
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('Candidate 4');
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).not.toContain('Candidate 0');
  });

  it('keeps loading and failed suggestions distinct from the factual empty result, with explicit retry', async () => {
    await start(); button('[data-tx-id="7"] [data-testid=bank-row-toggle]').click(); fixture.detectChanges();
    expect(el.querySelector('[aria-label="Loading suggested matches"]')).not.toBeNull();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).not.toContain('No suggested matches');
    http.expectOne('https://api.test/BankTransaction/7/suggestions').flush({}, { status: 502, statusText: 'Failure' });
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('Could not load');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Retry suggestions')!.click();
    http.expectOne('https://api.test/BankTransaction/7/suggestions').flush([]);
    await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('No suggested matches');
    expect(button('[aria-label="Create expense (not available yet)"]').disabled).toBe(true);
    expect(button('[aria-label="Create expense (not available yet)"]').title).toContain('create and link');
  });

  it('pages history independently and deduplicates live offset repeats, retaining exact values', async () => {
    fixture = TestBed.createComponent(BankPage); el = fixture.nativeElement;
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history([EXPENSES[0]], 0, true); await tick(); fixture.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Load older Expenses')!.click();
    history([EXPENSES[0], { ...EXPENSES[1], amount: '9999999999999999.99' }], 1, false);
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-history-id]')).toHaveLength(2);
    expect(el.querySelector('[data-history-id="21"]')?.textContent?.replace(/[\u00a0\u202f]/g, ' ')).toContain('-9 999 999 999 999 999,99 €');
    expect(el.querySelector('[data-history-id="20"]')?.textContent).toContain('00:30');
    http.expectNone('https://api.test/Expense/latest/20');
  });

  it.each([
    ['changed occurrence', '2026-10-02T19:00:00+01:00', '2026-10-02T18:00:00+01:00', '2026-10-02T17:00:00+01:00', '2026-10-02T16:00:00+01:00', ['2', '3', '1']],
    ['microseconds and numeric ties', '2026-10-02T18:00:00.000001+01:00', '2026-10-02T18:00:00.000001+01:00', '2026-10-02T18:00:00.000000+01:00', '2026-10-02T18:00:00.000001+01:00', ['2', '1', '3']],
    ['Lisbon fold offsets', '2026-10-25T01:45:00+00:00', '2026-10-25T01:30:00+00:00', '2026-10-25T01:45:00+01:00', '2026-10-25T01:00:00+01:00', ['2', '3', '1']],
  ] as const)('keeps merged history chronological after live-page drift: %s', async (_case, firstDate, secondDate, editedDate, olderDate, expected) => {
    fixture = TestBed.createComponent(BankPage); el = fixture.nativeElement;
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history([{ ...EXPENSES[0], id: 3, bookingDate: firstDate as string },
      { ...EXPENSES[0], id: 2, bookingDate: secondDate as string }], 0, true);
    await tick(); fixture.detectChanges();

    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Load older Expenses')!.click();
    history([{ ...EXPENSES[0], id: 3, bookingDate: editedDate as string },
      { ...EXPENSES[0], id: 1, bookingDate: olderDate as string }], 1, false);
    await tick(); fixture.detectChanges();

    expect([...el.querySelectorAll<HTMLElement>('[data-history-id]')]
      .map(row => row.dataset['historyId'])).toEqual(expected);
  });

  it('keeps actions disabled after a failed recovery read until explicit Retry refreshes state', async () => {
    await start(); await open(); button('[data-testid=match-expense]').click();
    http.expectOne('https://api.test/BankTransaction/7/match').flush({}, { status: 502, statusText: 'Failure' });
    await tick();
    http.expectOne('https://api.test/BankTransaction').flush({}, { status: 502, statusText: 'Failure' });
    history(); await tick(); fixture.detectChanges();
    expect(button('[data-testid=match-expense]')?.disabled ?? true).toBe(true);
    const ignore = button('[data-testid=bank-action]');
    const sync = button('[data-testid=sync-bank]');
    expect(ignore.disabled).toBe(true);
    expect(sync.disabled).toBe(true);
    // Dispatch even through a stale/native-disabled button: the operation guard
    // must independently reject transport, not rely on repainting the binding.
    ignore.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sync.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    http.expectNone('https://api.test/BankTransaction/7/ignore');
    http.expectNone('https://api.test/BankTransaction/sync');
    button('[data-testid=bank-retry]').click();
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history(); await tick();
    http.expectOne('https://api.test/BankTransaction/7/suggestions').flush(EXPENSES);
    await tick(); fixture.detectChanges();
    expect(button('[data-testid=match-expense]').disabled).toBe(false);
    expect(button('[data-testid=bank-action]').disabled).toBe(false);
    expect(button('[data-testid=sync-bank]').disabled).toBe(false);
    http.expectNone('https://api.test/BankTransaction/7/match');
  });

  it('matches once, disables duplicate intent, then refreshes all rows, counts and history', async () => {
    await start(); await open();
    const match = button('[data-testid=match-expense]');
    expect(match.disabled).toBe(false);
    match.click(); match.click(); fixture.detectChanges();
    expect(match.disabled).toBe(true);
    const req = http.expectOne('https://api.test/BankTransaction/7/match');
    expect(req.request.body).toEqual({ expenseId: 20 });
    req.flush({ ...ROWS[0], reviewStatus: 'matched', linkedExpense: EXPENSES[0], suggestedExpenseCount: 0 });
    await tick();
    http.expectOne('https://api.test/BankTransaction').flush([{ ...ROWS[0], reviewStatus: 'matched', linkedExpense: EXPENSES[0], suggestedExpenseCount: 0 }, ...ROWS.slice(1)]);
    history(); await tick(); fixture.detectChanges();
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).toContain('Unmatch');
    expect(el.querySelector('[data-testid=bank-details]')?.textContent).not.toContain('Match this');
    expect(el.querySelector('[data-history-id="20"]')?.textContent).toContain('Matched');
    http.expectNone('https://api.test/BankTransaction/7/match');
    button('[data-testid=unmatch-expense]').click();
    const unmatch = http.expectOne('https://api.test/BankTransaction/7/unmatch');
    expect(unmatch.request.body).toEqual({ expenseId: 20 });
    unmatch.flush(ROWS[0]); await tick();
    http.expectOne('https://api.test/BankTransaction').flush(ROWS);
    history(); await tick();
    http.expectOne('https://api.test/BankTransaction/7/suggestions').flush(EXPENSES);
    await tick(); fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=match-expense]')).toHaveLength(3);
  });
});
