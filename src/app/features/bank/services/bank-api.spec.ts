import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BankApi } from './bank-api';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const API_PENDING = [
  {
    id: 7,
    bookingDate: '2026-10-02',
    amount: 58.93,
    currency: 'EUR',
    remittanceInformation: 'CONTINENTE ONLINE 8831',
    suggestedCategory: { id: 3, name: 'Shopping' },
    direction: 'DBIT',
    status: 'BOOK',
  },
  {
    id: 8,
    bookingDate: '2026-10-01',
    amount: 200,
    currency: 'EUR',
    remittanceInformation: 'TRF MB WAY PARA MARIA S',
    suggestedCategory: null,
  },
];

describe('BankApi', () => {
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

  it('lists all review states with optional selected query and preserves exact linked-expense data', async () => {
    const api = TestBed.inject(BankApi);
    const promise = api.list('matched');
    const req = http.expectOne('https://api.test/BankTransaction?reviewStatus=matched');
    expect(req.request.headers.get('x-google-idtoken')).toBe('id-token');
    req.flush([{ id: '9223372036854775807', accountUid: 'account-test', bookingDate: '2026-10-02', amount: '123456789.123456789', currency: 'EUR', status: 'BOOK', reviewStatus: 'matched', remittanceInformation: 'Bank description', suggestedCategory: { id: 3, name: 'Shopping' }, linkedExpense: { id: 12, bookingDate: '2026-10-02T23:30:00+01:00', amount: '123456789.123456789', currency: 'EUR', description: 'Expense description', category: 'Shopping' } }]);
    expect(await promise).toEqual([{ id: '9223372036854775807', accountUid: 'account-test', date: '2026-10-02', amount: '123456789.123456789', currency: 'EUR', status: 'BOOK', reviewStatus: 'matched', suggestedExpenseCount: 0, description: 'Bank description', suggestedCategory: { id: '3', name: 'Shopping' }, linkedExpense: { id: 12, bookingDate: '2026-10-02T23:30:00+01:00', amount: '123456789.123456789', currency: 'EUR', description: 'Expense description', category: 'Shopping' } }]);
  });

  it('preserves distinct numeric Int64 IDs from the actual JSON list without rounding', async () => {
    const promise = TestBed.inject(BankApi).list();
    const req = http.expectOne('https://api.test/BankTransaction');
    req.flush('[{"id":9007199254740992,"remittanceInformation":"first"},{"id":9007199254740993,"remittanceInformation":"second"},{"id":9223372036854775807,"linkedExpense":{"id":12,"bookingDate":"2026-10-02T12:00:00+01:00","amount":"8.99","currency":"EUR","description":"Expense","category":"Entertainment"}}]');

    const rows = await promise;
    expect(rows.map(row => row.id)).toEqual(['9007199254740992', '9007199254740993', '9223372036854775807']);
    expect(rows[2].linkedExpense?.id).toBe(12);
  });

  it('GET /BankTransaction sends the human-auth headers and maps pending rows tolerantly', async () => {
    const promise = TestBed.inject(BankApi).list();

    const req = http.expectOne('https://api.test/BankTransaction');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush(API_PENDING);

    const rows = await promise;
    expect(rows).toEqual([
      {
        id: '7', accountUid: '', status: 'BOOK', reviewStatus: 'needsReview', suggestedExpenseCount: 0, linkedExpense: null,
        date: '2026-10-02',
        amount: '58.93',
        currency: 'EUR',
        description: 'CONTINENTE ONLINE 8831',
        suggestedCategory: { id: '3', name: 'Shopping' },
      },
      {
        id: '8', accountUid: '', status: '', reviewStatus: 'needsReview', suggestedExpenseCount: 0, linkedExpense: null,
        date: '2026-10-01',
        amount: '200',
        currency: 'EUR',
        description: 'TRF MB WAY PARA MARIA S',
        suggestedCategory: null,
      },
    ]);
  });

  it('pending() drops rows without usable identity and tolerates null fields', async () => {
    const promise = TestBed.inject(BankApi).list();
    const req = http.expectOne('https://api.test/BankTransaction');
    req.flush([
      null,
      { bookingDate: '2026-10-03', amount: 5, currency: 'EUR', remittanceInformation: 'X' },
      { id: 9, amount: null, currency: null, remittanceInformation: null, suggestedCategory: { id: 5, name: 'Bills' } },
    ]);
    const rows = await promise;
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('');
    expect(rows[0].suggestedCategory).toEqual({ id: '5', name: 'Bills' });
  });

  it.each(['9007199254740993', '-123456789.123456789', '0'])('normalizes bank exact metadata %s into a single amount', async amount => {
    const pending = TestBed.inject(BankApi).list();
    http.expectOne('https://api.test/BankTransaction').flush([{ id: '9', amount }]);
    const [row] = await pending;
    expect(row.amount).toBe(amount);
    expect(row.id).toBe('9');
    expect(row).not.toHaveProperty('amountExact');
  });

  it.each(['all', 'needsReview', 'matched', 'ignored'] as const)('sends the selected %s filter unchanged', async status => {
    const promise = TestBed.inject(BankApi).list(status);
    const req = http.expectOne(`https://api.test/BankTransaction?reviewStatus=${status}`);
    expect(req.request.method).toBe('GET');
    req.flush([]); expect(await promise).toEqual([]);
  });

  it.each(['ignore', 'review'] as const)('POST %s preserves the Int64 path and returns the complete DTO on repeated idempotent requests', async action => {
    const api = TestBed.inject(BankApi);
    for (let repeat = 0; repeat < 2; repeat++) {
      const promise = api[action]('9223372036854775807');
      const req = http.expectOne(`https://api.test/BankTransaction/9223372036854775807/${action}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(req.request.headers.get('x-google-idtoken')).toBe('id-token');
      req.flush({ ...API_PENDING[0], id: '9223372036854775807', amount: '9007199254740993', reviewStatus: action === 'ignore' ? 'ignored' : 'needsReview', linkedExpense: null });
      const row = await promise;
      expect(row.id).toBe('9223372036854775807');
      expect(row.amount).toBe('9007199254740993');
      expect(row.reviewStatus).toBe(action === 'ignore' ? 'ignored' : 'needsReview');
      expect(row.linkedExpense).toBeNull();
    }
  });

  it('uses the original numeric list identity for an action and preserves its numeric response', async () => {
    const api = TestBed.inject(BankApi);
    const listing = api.list();
    http.expectOne('https://api.test/BankTransaction').flush('[{"id":9223372036854775807,"reviewStatus":"needsReview"}]');
    const [loaded] = await listing;

    const action = api.ignore(loaded.id);
    const req = http.expectOne('https://api.test/BankTransaction/9223372036854775807/ignore');
    req.flush('{"id":9223372036854775807,"reviewStatus":"ignored","linkedExpense":null}');

    expect((await action).id).toBe('9223372036854775807');
  });

  it('loads complete suggestions without losing exact expense amounts or bank identity', async () => {
    const api = TestBed.inject(BankApi);
    const promise = api.suggestions('9223372036854775807');
    const req = http.expectOne('https://api.test/BankTransaction/9223372036854775807/suggestions');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    const expense = { id: 2147483647, bookingDate: '2026-10-02T12:34:56.123456+01:00', amount: '9999999999999999.99', currency: 'EUR', description: 'Candidate', category: 'Shopping' };
    req.flush([expense]);
    expect(await promise).toEqual([expense]);
  });

  it.each(['match', 'unmatch'] as const)('POST %s carries explicit expected expense identity and reads raw numeric Int64 response', async action => {
    const promise = TestBed.inject(BankApi)[action]('9223372036854775807', 2147483647);
    const req = http.expectOne(`https://api.test/BankTransaction/9223372036854775807/${action}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ expenseId: 2147483647 });
    req.flush('{"id":9223372036854775807,"reviewStatus":"needsReview","suggestedExpenseCount":5}');
    expect(await promise).toMatchObject({ id: '9223372036854775807', suggestedExpenseCount: 5 });
  });

  it('POST /BankTransaction/sync returns the fetched/new counts', async () => {
    const promise = TestBed.inject(BankApi).sync();
    const req = http.expectOne('https://api.test/BankTransaction/sync');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush({ fetched: 12, new: 3 });
    expect(await promise).toEqual({ fetched: 12, new: 3 });
  });

  it('connections() maps the wrapped account list tolerantly', async () => {
    const promise = TestBed.inject(BankApi).connections();
    const req = http.expectOne('https://api.test/BankConnection');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush({
      accounts: [
        null,
        {
          name: 'Conta Casa',
          ibanMasked: '•••• 1234',
          currency: 'EUR',
          aspspName: 'Activo Bank',
          aspspCountry: 'PT',
          consentStatus: 'VALID',
          consentExpiresAt: '2027-01-06T12:00:00Z',
        },
        { name: 'Conta 2' },
      ],
    });
    expect(await promise).toEqual([
      {
        name: 'Conta Casa',
        ibanMasked: '•••• 1234',
        currency: 'EUR',
        aspspName: 'Activo Bank',
        aspspCountry: 'PT',
        consentStatus: 'VALID',
        consentExpiresAt: '2027-01-06T12:00:00Z',
      },
      {
        name: 'Conta 2',
        ibanMasked: '',
        currency: '',
        aspspName: '',
        aspspCountry: '',
        consentStatus: '',
        consentExpiresAt: null,
      },
    ]);
  });

  it('connections() resolves an empty list for a missing/null wrapper', async () => {
    const promise = TestBed.inject(BankApi).connections();
    http.expectOne('https://api.test/BankConnection').flush({ accounts: null });
    expect(await promise).toEqual([]);
  });

  it('authUrl() asks for Activo Bank / PT and resolves the consent URL', async () => {
    const promise = TestBed.inject(BankApi).authUrl();
    const req = http.expectOne('https://api.test/BankAuth/url?aspsp=Activo%20Bank&country=PT');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush({ url: 'https://consent.enablebanking.com/...' });
    expect(await promise).toBe('https://consent.enablebanking.com/...');
  });

  it('authUrl() rejects when the API returns no URL', async () => {
    const promise = TestBed.inject(BankApi).authUrl();
    http.expectOne('https://api.test/BankAuth/url?aspsp=Activo%20Bank&country=PT').flush({ url: '' });
    await expect(promise).rejects.toThrow();
  });

  it('authUrl() uses the environment bank when the env carries one (sandbox Nordea/FI, issue #64 fix)', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: { ...TEST_ENV, bankName: 'Nordea', bankCountry: 'FI' } },
      ],
    });
    const http2 = TestBed.inject(HttpTestingController);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    const promise = TestBed.inject(BankApi).authUrl();
    const req = http2.expectOne('https://api.test/BankAuth/url?aspsp=Nordea&country=FI');
    req.flush({ url: 'https://consent.enablebanking.com/...' });
    expect(await promise).toBe('https://consent.enablebanking.com/...');
  });
});
