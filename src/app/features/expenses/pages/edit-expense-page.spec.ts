import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { routes } from '../../../app.routes';
import { SESSION_STORAGE_KEY, serializeSession } from '../../../core/auth/auth-session';

let http: HttpTestingController;
let harness: RouterTestingHarness;
const detail = { id: 7, amount: '-65.5500', description: 'Veggies and fruit', category: 'Groceries', bookingDate: '2026-07-02T05:45:27.123456+05:30', currency: 'EUR', revision: '1' };
beforeEach(async () => {
  localStorage.setItem(SESSION_STORAGE_KEY, serializeSession({ idToken: 'test', accessToken: 'test', expiresAt: Date.now() + 3600000 }));
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes), { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test', googleClientId: 'test' } }] });
  http = TestBed.inject(HttpTestingController);
  harness = await RouterTestingHarness.create();
});
afterEach(() => { http.verify(); localStorage.removeItem(SESSION_STORAGE_KEY); });
async function open(resource = detail) {
  await harness.navigateByUrl('/expenses/7/edit');
  http.expectOne('https://api.test/Expense/7').flush(resource, { headers: { ETag: '"1"' } });
  http.expectOne('https://api.test/Category').flush({ categories: [{ name: 'Groceries' }] });
  await harness.fixture.whenStable();
  harness.fixture.debugElement.query(By.css('g-edit-expense-page')).injector.get(ChangeDetectorRef).markForCheck();
  await vi.waitFor(() => { harness.detectChanges(); expect(input('amount')).not.toBeNull(); });
}
function input(name: string): HTMLInputElement { return harness.fixture.nativeElement.querySelector(`#mobile-${name}`); }
function button(text: string): HTMLButtonElement { return Array.from(harness.fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => b.textContent?.trim() === text)!; }
function set(name: string, value: string) { input(name).value = value; input(name).dispatchEvent(new Event('input')); harness.detectChanges(); }
it.each([412, 404, 'uncertain-absent'] as const)('dirty Back after recovery %s never claims the saved expense is unchanged', async outcome => {
  await open(); set('description', 'Retained intent'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: outcome === 'uncertain-absent' ? 503 : outcome, statusText: 'Failed' });
  if (outcome === 'uncertain-absent') {
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('https://api.test/Expense/7').flush({}, { status: 404, statusText: 'Not Found' });
  }
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('dialog').textContent).toContain(outcome === 412 ? 'Expense changed' : outcome === 404 ? 'Expense unavailable' : 'Expense is now absent'); });
  if (outcome === 412) { button('Keep editing').click(); harness.detectChanges(); button('Cancel').click(); }
  else button('Back to expenses').click();
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Discard changes')).toBeDefined(); });
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  expect(dialog.textContent).not.toContain('Your saved expense is unchanged');
  if (outcome === 'uncertain-absent') expect(dialog.textContent).toContain('previous write outcome is not confirmed');
  button('Keep editing').click(); await harness.fixture.whenStable(); harness.detectChanges();
  expect(input('description').value).toBe('Retained intent');
  expect(TestBed.inject(Router).url).toBe('/expenses/7/edit');
  button('Cancel').click();
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Discard changes')).toBeDefined(); });
  button('Discard changes').click();
  await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/'));
  http.match('https://api.test/Expense/latest/20').forEach(r => r.flush({ expenses: [] }));
  http.expectNone('https://api.test/Expense/7');
});
it.each([
  { category: 'Restaurants' },
  { bookingDate: '2026-07-02T05:45:27.654321+05:30' },
])('shows full current resource separately from retained edits after a concurrent change %j', async change => {
  await open(); set('description', 'My retained intent'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 503, statusText: 'Unavailable' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const current = { ...detail, ...change, revision: '9223372036854775807' };
  http.expectOne('https://api.test/Expense/7').flush(current, { headers: { ETag: '"9223372036854775807"' } });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('dialog').textContent).toContain('Review current expense'); });
  function expectCurrent(summary: HTMLElement) {
    expect(summary.textContent).toContain('Veggies and fruit');
    expect(summary.textContent).toContain('-65.5500');
    expect(summary.textContent).toContain(`Category: ${current.category}`);
    expect(summary.textContent).toContain(`Booking date: ${current.bookingDate}`);
    expect(summary.textContent).toContain('Revision: 9223372036854775807');
    expect(summary.textContent).not.toContain('My retained intent');
  }
  expectCurrent(harness.fixture.nativeElement.querySelector('dialog'));
  button('Keep editing').click(); harness.detectChanges();
  const summaries = harness.fixture.nativeElement.querySelectorAll('[aria-label="Current expense"]') as NodeListOf<HTMLElement>;
  expect(summaries.length).toBe(2);
  summaries.forEach(expectCurrent);
  expect(input('description').value).toBe('My retained intent');
  expect(input('category').value).toBe('Groceries');
  expect(input('time').value).toBe('01:15');
  expect(button('Save changes').disabled).toBe(true);
  http.expectNone('https://api.test/Expense/7');
});
it('loads direct edit route and saves blank description with exact untouched amount and timestamp', async () => {
  await open();
  expect(input('amount').value).toBe('-65,5500');
  expect(input('date').value).toBe('2026-07-02');
  set('description', '');
  button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.method).toBe('PUT');
  expect(req.request.headers.get('If-Match')).toBe('"1"');
  expect(req.request.body).toEqual({ amount: '-65.5500', description: '', category: 'Groceries', bookingDate: detail.bookingDate, currency: 'EUR' });
  req.flush(detail);
  await harness.fixture.whenStable();
  http.match('https://api.test/Expense/latest/20').forEach(r => r.flush({ expenses: [] }));
  await harness.fixture.whenStable();
  expect(TestBed.inject(Router).url).toBe('/');
});
it('guards changed Cancel with Keep editing and Discard changes, leaving untouched fields immediately', async () => {
  await open();
  set('description', 'Unsaved edit');
  button('Cancel').click();
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Keep editing')).toBeDefined(); });
  expect(TestBed.inject(Router).url).toBe('/expenses/7/edit');
  button('Keep editing').click();
  await harness.fixture.whenStable(); harness.detectChanges();
  expect(input('description').value).toBe('Unsaved edit');
  button('Cancel').click();
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Discard changes')).toBeDefined(); });
  button('Discard changes').click();
  await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/'));
  http.match('https://api.test/Expense/latest/20').forEach(r => r.flush({ expenses: [] }));
});
it('confirms permanent deletion with original resource values and sends DELETE once', async () => {
  await open();
  set('description', 'Not saved');
  button('Delete expense').click();
  harness.detectChanges();
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  expect(dialog.textContent).toContain('Veggies and fruit');
  expect(dialog.textContent).toContain('-65.5500');
  expect(dialog.textContent).toContain('cannot be undone');
  const confirm = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Delete expense')!;
  confirm.click(); confirm.click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.method).toBe('DELETE');
  expect(req.request.headers.get('If-Match')).toBe('"1"');
  req.flush(null, { status: 204, statusText: 'No Content' });
  await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/'));
  http.match('https://api.test/Expense/latest/20').forEach(r => r.flush({ expenses: [] }));
});
it('retains stale edits and requires explicit discard confirmation before reloading a fresh revision', async () => {
  await open(); set('description', 'My stale edit'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 412, statusText: 'Precondition Failed' });
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Reload expense')).toBeDefined(); });
  expect(input('description').value).toBe('My stale edit');
  expect(button('Save changes').disabled).toBe(true);
  button('Reload expense').click(); harness.detectChanges();
  expect(harness.fixture.nativeElement.querySelector('dialog').textContent).toContain('discards your unsaved edits');
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reload expense')!.click();
  http.expectOne('https://api.test/Expense/7').flush({ ...detail, description: 'Other writer', revision: '2' }, { headers: { ETag: '"2"' } });
  await vi.waitFor(() => { harness.detectChanges(); expect(input('description').value).toBe('Other writer'); });
  button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.headers.get('If-Match')).toBe('"2"');
  req.flush({}, { status: 409, statusText: 'Conflict' });
});
it('checks exact ID after a lost save, never equates identical current values with write success, and blocks writes until deliberate reload', async () => {
  await open(); set('description', 'My intent'); button('Save changes').click(); button('Save changes').click();
  const write = http.expectOne('https://api.test/Expense/7');
  write.flush({}, { status: 503, statusText: 'Unavailable' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const readback = http.expectOne('https://api.test/Expense/7');
  expect(readback.request.method).toBe('GET');
  readback.flush({ ...detail, description: 'My intent', revision: '2' }, { headers: { ETag: '"2"' } });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.textContent).toContain('does not prove your operation succeeded'); });
  expect(input('description').value).toBe('My intent');
  expect(TestBed.inject(Router).url).toBe('/expenses/7/edit');
  expect(button('Save changes').disabled).toBe(true);
  button('Save changes').click(); button('Delete expense').click();
  http.expectNone('https://api.test/Expense/7');
});
it('treats definite 404 as unavailable, keeps edits and offers Back to expenses without recreation', async () => {
  await open(); set('description', 'Retain this'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 404, statusText: 'Not Found' });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.textContent).toContain('This expense no longer exists'); });
  expect(input('description').value).toBe('Retain this');
  expect(button('Save changes').disabled).toBe(true);
  expect(button('Back to expenses')).toBeDefined();
  http.expectNone(r => r.method === 'POST');
});
it('opens list rows by immutable ID with accessible link activation, leaving null identity uneditable', async () => {
  await harness.navigateByUrl('/');
  http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [detail, { ...detail, id: null, description: 'Legacy row' }] });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('[data-expense-id="7"]')).not.toBeNull(); });
  const row: HTMLElement = harness.fixture.nativeElement.querySelector('[data-expense-id="7"]');
  expect(row.getAttribute('tabindex')).toBe('0');
  expect(row.getAttribute('role')).toBe('link');
  row.click();
  await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/expenses/7/edit'));
  http.expectOne('https://api.test/Expense/7').flush(detail, { headers: { ETag: '"1"' } });
  http.expectOne('https://api.test/Category').flush({ categories: [{ name: 'Groceries' }] });
});
it('refreshes the list and announces Expense updated only on acknowledged save', async () => {
  await open(); set('description', 'Confirmed'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({ ...detail, description: 'Confirmed' });
  await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/'));
  http.match('https://api.test/Expense/latest/20').forEach(r => r.flush({ expenses: [{ ...detail, description: 'Confirmed' }] }));
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Expense updated'); });
});
it('validates Lisbon gaps and folds and uses zero seconds for edited minutes on a valid save', async () => {
  await open(); set('date', '2026-03-29'); set('time', '01:30'); button('Save changes').click(); harness.detectChanges();
  expect(harness.fixture.nativeElement.textContent).toContain('does not exist in Lisbon');
  http.expectNone('https://api.test/Expense/7');
  set('date', '2026-10-25'); set('time', '01:30'); button('Save changes').click(); harness.detectChanges();
  expect(harness.fixture.nativeElement.textContent).toContain('occurs twice in Lisbon');
  set('date', '2026-07-03'); set('time', '14:23'); button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.body.bookingDate).toBe('2026-07-03T14:23:00+01:00');
  req.flush({}, { status: 409, statusText: 'Conflict' });
});
it('opens native daisyUI Time with minutes only and saves the original microsecond offset unchanged', async () => {
  await open();
  expect(input('time').type).toBe('time');
  expect(input('time').step).toBe('60');
  expect(input('time').classList.contains('input')).toBe(true);
  expect(input('time').value).toBe('01:15');
  button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.body.bookingDate).toBe('2026-07-02T05:45:27.123456+05:30');
  req.flush({}, { status: 409, statusText: 'Rejected' });
});
it.each(['2026-10-25T01:30:00.123456+00:00', '2026-10-25T01:30:42.654321+00:00', '2026-10-25T01:30:27.123456+01:00'])('reverting native minutes restores exact known fold %s and clean unload', async bookingDate => {
  await open({ ...detail, bookingDate });
  set('date', '2026-10-26'); set('time', '02:30');
  set('date', '2026-10-25'); set('time', '01:30:00');
  const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  expect(harness.fixture.nativeElement.textContent).toContain('Original precision retained');
  button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.body.bookingDate).toBe(bookingDate);
  req.flush({}, { status: 409, statusText: 'Rejected' });
});
it('rejects subsecond edits unsupported by the minute-only native Time contract', async () => {
  await open(); set('time', '14:23:45.123'); button('Save changes').click(); harness.detectChanges();
  expect(harness.fixture.nativeElement.textContent).toContain('Enter a valid time');
  http.expectNone('https://api.test/Expense/7');
});
it('date-only changes retain original seconds and microseconds in a newly resolved Lisbon offset', async () => {
  await open(); set('date', '2026-07-03');
  expect(harness.fixture.nativeElement.textContent).not.toContain('Original precision retained');
  button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.body.bookingDate).toBe('2026-07-03T01:15:27.123456+01:00');
  req.flush({}, { status: 409, statusText: 'Rejected' });
});
it('reports both invalid Amount and Lisbon Time and marks the controls accessibly', async () => {
  await open(); set('amount', '1,2,3'); set('date', '2026-03-29'); set('time', '01:30'); button('Save changes').click(); harness.detectChanges();
  expect(input('amount').getAttribute('aria-invalid')).toBe('true');
  expect(input('time').getAttribute('aria-invalid')).toBe('true');
  expect(harness.fixture.nativeElement.textContent).toContain('valid decimal amount');
  expect(harness.fixture.nativeElement.textContent).toContain('does not exist in Lisbon');
  http.expectNone('https://api.test/Expense/7');
});
it('keeps uncertainty blocked when readback fails, Check again is GET only, and absence never shows deleted success', async () => {
  await open(); button('Delete expense').click(); harness.detectChanges();
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Delete expense')!.click();
  http.expectOne('https://api.test/Expense/7').error(new ProgressEvent('error'));
  await new Promise(resolve => setTimeout(resolve, 0));
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 503, statusText: 'Unavailable' });
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Check again')).toBeDefined(); });
  expect(button('Save changes').disabled).toBe(true);
  button('Check again').click(); button('Check again').click();
  const check = http.expectOne('https://api.test/Expense/7');
  expect(check.request.method).toBe('GET');
  check.flush({}, { status: 404, statusText: 'Not Found' });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.textContent).toContain('does not confirm who deleted it'); });
  expect(TestBed.inject(Router).url).toBe('/expenses/7/edit');
  expect(button('Save changes').disabled).toBe(true);
  expect(harness.fixture.nativeElement.textContent).not.toContain('Expense deleted');
});
it.each([409, 422, 400])('definite rejection %s retains every edit and does not read back', async status => {
  await open(); set('amount', '-123456789,123456789'); set('description', 'Retained'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status, statusText: 'Rejected' });
  if (status === 422) {
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('https://api.test/Category').flush({ categories: [{ name: 'Groceries' }] });
  }
  await vi.waitFor(() => { harness.detectChanges(); expect(button('Save changes').disabled).toBe(false); });
  expect(input('amount').value).toBe('-123456789,123456789');
  expect(input('description').value).toBe('Retained');
  http.expectNone('https://api.test/Expense/7');
});
it('guards native unload only when changed or a write is unresolved', async () => {
  await open();
  const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  set('description', 'Dirty');
  const dirty = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  button('Save changes').click();
  const leaving = TestBed.inject(Router).navigateByUrl('/settings');
  await expect(leaving).resolves.toBe(false);
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 409, statusText: 'Rejected' });
});
it.each([401, 403])('auth rejection %s retains edits and asks for sign-in without claiming success', async status => {
  await open(); set('description', 'Auth retained'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status, statusText: 'Unauthorised' });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.textContent).toContain('Sign in again'); });
  expect(input('description').value).toBe('Auth retained');
  http.expectNone('https://api.test/Expense/7');
});
it('traps backward Tab at the safe modal default', async () => {
  await open(); button('Delete expense').click(); harness.detectChanges();
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  const key = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  dialog.querySelector('button')!.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(true);
});
it('presents a stale recovery dialog with the approved discard warning and safe Keep editing choice', async () => {
  await open(); set('description', 'Retained'); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 412, statusText: 'Stale' });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('dialog').textContent).toContain('Expense changed'); });
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  expect(dialog.textContent).toContain('discards your unsaved edits');
  expect(dialog.querySelector('button')?.textContent).toContain('Keep editing');
});
it('refreshes current categories after category rejection while retaining the chosen value', async () => {
  await open(); button('Save changes').click();
  http.expectOne('https://api.test/Expense/7').flush({}, { status: 422, statusText: 'Category' });
  await new Promise(resolve => setTimeout(resolve, 0));
  http.expectOne('https://api.test/Category').flush({ categories: [{ name: 'Restaurants' }] });
  await vi.waitFor(() => { harness.detectChanges(); expect(harness.fixture.nativeElement.querySelector('#mobile-category').textContent).toContain('Restaurants'); });
  expect(input('description').value).toBe('Veggies and fruit');
});
it('restores the exact original instant when Date/Time edits are reverted', async () => {
  await open();
  set('date', '2026-07-03'); set('date', '2026-07-02'); button('Save changes').click();
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.body.bookingDate).toBe('2026-07-02T05:45:27.123456+05:30');
  req.flush({}, { status: 409, statusText: 'Rejected' });
});
it('keeps validation feedback below the form card as in the approved validation frame', async () => {
  await open(); set('amount', '1,2,3'); set('date', '2026-03-29'); set('time', '01:30'); button('Save changes').click(); harness.detectChanges();
  const feedback: HTMLElement = harness.fixture.nativeElement.querySelector('#mobile-time-error');
  expect(feedback.closest('form')).toBeNull();
  expect(feedback.closest('[role="alert"]')).not.toBeNull();
});
it('delete confirmation names the original Lisbon date, not an unsaved edited day', async () => {
  await open(); set('date', '2026-07-03'); button('Delete expense').click(); harness.detectChanges();
  const dialog: HTMLDialogElement = harness.fixture.nativeElement.querySelector('dialog');
  expect(dialog.textContent).toContain('02/07/2026');
  expect(dialog.textContent).not.toContain('03/07/2026');
});
