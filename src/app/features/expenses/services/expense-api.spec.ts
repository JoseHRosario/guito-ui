import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { ExpenseApi } from './expense-api';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const API_EXPENSES = {
  expenses: [
    { id: 'opaque/expense-id', storedOrder: 12, occurredAt: '2021-01-03T10:12:00+00:00', date: '2021-01-03T10:12:00', amount: -65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' },
    { storedOrder: 13, date: '2021-01-02T08:00:00', amount: 2500, description: 'Salary', category: null, creatorEmail: null },
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
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
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
      { id: 'opaque/expense-id', description: 'H&M', amount: -65.55, date: '2021-01-03T10:12:00+00:00', category: 'Clothing', icon: 'tag' },
      { id: '13', description: 'Salary', amount: 2500, date: '2021-01-02T08:00:00', category: '', icon: 'tag' },
    ]);
  });

  it.each([undefined, false, true])('create centrally gates all callers with capability %s', async expenseTimestampsEnabled => {
    const env = TestBed.inject(APP_ENVIRONMENT);
    Object.assign(env, { expenseTimestampsEnabled });
    const input = { date: '2026-07-02', occurredAt: '2026-07-02T05:45:27+05:30', currency: 'EUR' as const, amount: '9007199254740993', description: 'Exact', category: 'Food' };
    const pending = TestBed.inject(ExpenseApi).create(input);
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).toEqual(expenseTimestampsEnabled === true ? input : { date: input.date, amount: input.amount, description: input.description, category: input.category });
    req.flush({ id: 'opaque' });
    await expect(pending).resolves.toBe('opaque');
    delete (env as { expenseTimestampsEnabled?: boolean }).expenseTimestampsEnabled;
  });

  it('retains latest amountExact without converting it to a Number', async () => {
    const pending = TestBed.inject(ExpenseApi).latest();
    http.expectOne('https://api.test/Expense/latest/20').flush({ expenses: [{ id: 'exact', amount: 9007199254740992, amountExact: '9007199254740993' }] });
    expect((await pending)[0].amountExact).toBe('9007199254740993');
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