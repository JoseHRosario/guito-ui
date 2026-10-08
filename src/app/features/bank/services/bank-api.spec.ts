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
    suggestedCategoryId: 3, suggestedCategory: 'Shopping',
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

  it('GET /BankTransaction sends the human-auth headers and maps pending rows tolerantly', async () => {
    const promise = TestBed.inject(BankApi).pending();

    const req = http.expectOne('https://api.test/BankTransaction');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush(API_PENDING);

    const rows = await promise;
    expect(rows).toEqual([
      {
        id: '7',
        date: '2026-10-02',
        amount: 58.93,
        currency: 'EUR',
        description: 'CONTINENTE ONLINE 8831',
        suggestedCategory: { id: '3', name: 'Shopping' },
      },
      {
        id: '8',
        date: '2026-10-01',
        amount: 200,
        currency: 'EUR',
        description: 'TRF MB WAY PARA MARIA S',
        suggestedCategory: null,
      },
    ]);
  });

  it('pending() drops rows without usable identity and tolerates null fields', async () => {
    const promise = TestBed.inject(BankApi).pending();
    const req = http.expectOne('https://api.test/BankTransaction');
    req.flush([
      null,
      { bookingDate: '2026-10-03', amount: 5, currency: 'EUR', remittanceInformation: 'X' },
      { id: 9, amount: null, currency: null, remittanceInformation: null, suggestedCategoryId: 5, suggestedCategory: 'Bills' },
    ]);
    const rows = await promise;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: '', date: '2026-10-03', amount: 5, currency: 'EUR', description: 'X', suggestedCategory: null });
    expect(rows[1].description).toBe('');
    expect(rows[1].suggestedCategory).toEqual({ id: '5', name: 'Bills' });
  });

  it('POST /BankTransaction/sync returns the fetched/new counts', async () => {
    const promise = TestBed.inject(BankApi).sync();
    const req = http.expectOne('https://api.test/BankTransaction/sync');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush({ fetched: 12, new: 3 });
    expect(await promise).toEqual({ fetched: 12, new: 3 });
  });
});