import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { ExpenseApi } from './expense-api';
import { environment as productionEnvironment } from '../../../../environments/environment.prod';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const API_EXPENSES = {
  expenses: [
    { id: 12, bookingDate: '2021-01-03T10:12:00+00:00', amount: '-65.55', description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' },
    { id: 13, bookingDate: '2021-01-02T08:00:00', amount: '2500', description: 'Salary', category: null, creatorEmail: null },
  ],
};

describe('ExpenseApi.latest', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: { ...TEST_ENV } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it('requests the latest endpoint with the Bearer ID token and maps the DTO list', async () => {
    const promise = TestBed.inject(ExpenseApi).latest();

    const req = http.expectOne('https://api.test/Expense/latest/20');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush(API_EXPENSES);

    await expect(promise).resolves.toEqual([
      { id: 12, description: 'H&M', amount: '-65.55', bookingDate: '2021-01-03T10:12:00+00:00', category: 'Clothing', icon: 'tag' },
      { id: 13, description: 'Salary', amount: '2500', bookingDate: '2021-01-02T08:00:00', category: '', icon: 'tag' },
    ]);
  });

  it('production creates use the Postgres bookingDate contract and preserve exact amounts', async () => {
    const env = TestBed.inject(APP_ENVIRONMENT);
    Object.assign(env, productionEnvironment);
    const pending = TestBed.inject(ExpenseApi).create({
      date: '2026-07-02T00:15:42+01:00',
      currency: 'EUR',
      amount: '9007199254740993',
      description: 'Production contract regression',
      category: 'Food',
    });
    const req = http.expectOne(`${productionEnvironment.apiBaseUrl}/Expense`);
    req.flush({ id: 123 });
    await expect(pending).resolves.toBe(123);
    expect(req.request.body).toEqual({
      bookingDate: '2026-07-02T00:15:42+01:00',
      currency: 'EUR',
      amount: '9007199254740993',
      description: 'Production contract regression',
      category: 'Food',
    });
    expect(req.request.body).not.toHaveProperty('date');
    expect(req.request.body).not.toHaveProperty('occurredAt');
  });

  it.each([undefined, false, true])('create centrally gates all callers with capability %s', async expenseTimestampsEnabled => {
    const env = TestBed.inject(APP_ENVIRONMENT);
    Object.assign(env, { expenseTimestampsEnabled });
    const input = { date: '2026-07-02T05:45:27.123456+05:30', currency: 'EUR' as const, amount: '9007199254740993', description: 'Exact', category: 'Food' };
    const pending = TestBed.inject(ExpenseApi).create(input);
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).not.toHaveProperty('occurredAt');
    expect(req.request.body).not.toHaveProperty(expenseTimestampsEnabled === true ? 'date' : 'bookingDate');
    expect(req.request.body).toEqual({ [expenseTimestampsEnabled === true ? 'bookingDate' : 'date']: expenseTimestampsEnabled === true ? input.date : '2026-07-02', ...(expenseTimestampsEnabled === true ? { currency: input.currency } : {}), amount: input.amount, description: input.description, category: input.category });
    req.flush({ id: 123 });
    await expect(pending).resolves.toBe(123);
    delete (env as { expenseTimestampsEnabled?: boolean }).expenseTimestampsEnabled;
  });

  it('enabled create falls back to date and forwards only explicit body fields', async () => {
    const env = TestBed.inject(APP_ENVIRONMENT);
    Object.assign(env, { expenseTimestampsEnabled: true });
    const input = { date: '2026-07-02', amount: '0', description: 'Fallback', category: 'Food', updateDate: null, unexpected: 'must not forward' };
    const pending = TestBed.inject(ExpenseApi).create(input);
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).toEqual({ bookingDate: input.date, amount: '0', description: input.description, category: input.category });
    req.flush({ id: 123 });
    await expect(pending).resolves.toBe(123);
    delete (env as { expenseTimestampsEnabled?: boolean }).expenseTimestampsEnabled;
  });

  it.each(['0', '-1.25', '-123456789.123456789', 0, -1.25, -1e-7, -1e21])('creates signed/zero amount %s as exact decimal text', async amount => {
    const expected = typeof amount === 'string' ? amount : amount === -1e-7 ? '-0.0000001' : amount === -1e21 ? '-1000000000000000000000' : String(amount);
    const pending = TestBed.inject(ExpenseApi).create({ date: '2026-07-01', amount, description: 'Signed', category: 'Food' });
    // Attach rejection handling before inspecting the HTTP seam.
    const result = pending.catch(error => error);
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body.amount).toBe(expected);
    req.flush({ id: '2147483647', updateDate: null });
    expect(await result).toBe(2147483647);
  });

  it.each(['-79228162514264337593543950336', '-0.00000000000000000000000000001'])('rejects overflow %s before HTTP', async amount => {
    await expect(TestBed.inject(ExpenseApi).create({ date: '2026-07-01', amount, description: 'Overflow', category: 'Food' })).rejects.toThrow('expense-amount-invalid');
    http.expectNone('https://api.test/Expense');
  });

  it('keeps generated integer IDs numeric and ignores nullable updateDate', async () => {
    const pending = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [{ id: 2147483647, updateDate: null, creationDate: '2026-07-01', bookingDate: '2026-07-01T10:00:00+01:00', amount: '-1.25', category: 'Food' }] });
    expect(await pending).toEqual([{ id: 2147483647, description: '', amount: '-1.25', bookingDate: '2026-07-01T10:00:00+01:00', category: 'Food', icon: 'tag' }]);
  });

  it('retains latest amount without converting it to a Number', async () => {
    const pending = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [{ id: 123, bookingDate: '2026-07-02T05:45:27.123456+05:30', amount: '9007199254740993' }] });
    expect((await pending)[0].amount).toBe('9007199254740993');
  });

  it('tolerates legacy date/numeric amount without inventing ordinal identity', async () => {
    const pending = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [
      { storedOrder: 12, date: '2021-01-03T10:12:00', amount: -1e-7 },
      { id: 23, bookingDate: null, date: '1900-01-01', amount: null },
    ] });
    expect(await pending).toEqual([
      { id: null, bookingDate: '2021-01-03T10:12:00', amount: '-0.0000001', description: '', category: '', icon: 'tag' },
      { id: 23, bookingDate: null, amount: null, description: '', category: '', icon: 'tag' },
    ]);
  });

  it.each([123, '123', 'old-sheet-id'])('adapts create ID %s without retaining string IDs', async id => {
    const pending = TestBed.inject(ExpenseApi).create({ date: '2026-07-02', amount: '0', description: 'Legacy', category: 'Food' });
    http.expectOne('https://api.test/Expense').flush({ id });
    expect(await pending).toBe(id === 'old-sheet-id' ? null : 123);
  });

  it('tolerates a missing expenses array' , async () => {
    const promise = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush({});
    await expect(promise).resolves.toEqual([]);
  });

  it('rejects on API failure so the screen can show its error card', async () => {
    const promise = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush('boom', { status: 500, statusText: 'Server Error' });
    await expect(promise).rejects.toThrow();
  });
});