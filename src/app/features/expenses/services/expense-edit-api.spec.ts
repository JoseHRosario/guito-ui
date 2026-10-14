import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { ExpenseApi } from './expense-api';

let http: HttpTestingController;
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test' } }] });
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => http.verify());
const detail = { id: 7, amount: '-65.5500', description: '', category: 'Groceries', bookingDate: '2026-07-02T05:45:27.123456+05:30', currency: 'EUR', revision: '1' };
it('reads the exact immutable ID and retains decimal scale, timestamp and quoted ETag', async () => {
  const pending = TestBed.inject(ExpenseApi).detail(7);
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.method).toBe('GET');
  expect(req.request.headers.get('Cache-Control')).toBe('no-store');
  req.flush(detail, { headers: { ETag: '"1"' } });
  await expect(pending).resolves.toEqual({ ...detail, etag: '"1"' });
});
it('updates every editable field using the received If-Match without precision conversion', async () => {
  const input = { amount: '-0.0000', description: '', category: 'Groceries', bookingDate: detail.bookingDate, currency: 'EUR' as const };
  const pending = TestBed.inject(ExpenseApi).update(7, '"1"', input);
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.method).toBe('PUT');
  expect(req.request.headers.get('If-Match')).toBe('"1"');
  expect(req.request.body).toEqual(input);
  req.flush({ ...detail, ...input, revision: '2' }, { headers: { ETag: '"2"' } });
  await expect(pending).resolves.toBeUndefined();
});
it('deletes only the immutable ID with its loaded quoted revision and acknowledges only 204', async () => {
  const pending = TestBed.inject(ExpenseApi).delete(7, '"1"');
  const req = http.expectOne('https://api.test/Expense/7');
  expect(req.request.method).toBe('DELETE');
  expect(req.request.headers.get('If-Match')).toBe('"1"');
  req.flush(null, { status: 204, statusText: 'No Content' });
  await expect(pending).resolves.toBeUndefined();
});
it.each([0, -1, 2147483648, 1.5])('rejects non-Int32 identity %s without HTTP', async id => {
  await expect(TestBed.inject(ExpenseApi).detail(id)).rejects.toThrow('expense-id-invalid');
  await expect(TestBed.inject(ExpenseApi).delete(id, '"1"')).rejects.toThrow('expense-id-invalid');
});
it.each([null, 'W/"1"', '"2"', '1'])('blocks malformed or inconsistent received ETag %s', async etag => {
  const pending = TestBed.inject(ExpenseApi).detail(7);
  const rejected = expect(pending).rejects.toThrow('expense-detail-invalid');
  http.expectOne('https://api.test/Expense/7').flush(detail, { headers: etag ? { ETag: etag } : {} });
  await rejected;
});
it.each(['1', '*', 'W/"1"', '"01"', '"0"', '"9223372036854775808"'])('blocks unsafe CAS %s before writing', async etag => {
  await expect(TestBed.inject(ExpenseApi).delete(7, etag)).rejects.toThrow('expense-revision-invalid');
});
it.each([202, 204])('does not acknowledge PUT status %s', async status => {
  const pending = TestBed.inject(ExpenseApi).update(7, '"1"', { ...detail, currency: 'EUR' });
  const rejected = expect(pending).rejects.toThrow('expense-write-unconfirmed');
  http.expectOne('https://api.test/Expense/7').flush(null, { status, statusText: 'Unconfirmed' });
  await rejected;
});
it('does not acknowledge DELETE 200', async () => {
  const pending = TestBed.inject(ExpenseApi).delete(7, '"1"');
  const rejected = expect(pending).rejects.toThrow('expense-write-unconfirmed');
  http.expectOne('https://api.test/Expense/7').flush({});
  await rejected;
});
