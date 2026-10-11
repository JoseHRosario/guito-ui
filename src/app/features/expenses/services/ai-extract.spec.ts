import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { AiExtractApi } from './ai-extract';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

describe('AiExtractApi (POST /AI/extract, guito-ui#44)', () => {
  let http: HttpTestingController;
  let api: AiExtractApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([])), provideHttpClientTesting(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AiExtractApi);
  });

  afterEach(() => http.verify());

  it('posts the pt-PT prompt and maps the camelCase proposal', async () => {
    const pending = api.extract('café 2,30 no Coco Verde');
    const req = http.expectOne('https://api.test/AI/extract');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ language: 'pt-PT', prompt: 'café 2,30 no Coco Verde' });
    req.flush({ bookingDate: '2026-10-02', date: '1900-01-01', amount: '2.3', description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).resolves.toEqual({ date: '2026-10-02', amount: '2.3', description: 'Coco Verde', category: 'Eating out' });
  });

  it('retains the single exact decimal amount', async () => {
    const pending = api.extract('exact');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-07-02', amount: '123456789.123456789', description: 'Exact', category: 'Food' });
    expect((await pending).amount).toBe('123456789.123456789');
  });

  it('rejects invalid decimal text', async () => {
    const pending = api.extract('exact');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-07-02', amount: 'bad', description: 'Exact', category: 'Food' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it.each([0, -1.25])('accepts signed/zero proposal amount %s', async amount => {
    const pending = api.extract('signed');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount, description: 'Signed', category: 'Food' });
    expect((await pending).amount).toBe(String(amount));
  });

  it.each(['bookingDate', 'date'])('retains microseconds and >2^53 decimal text from %s in one internal date/amount', async field => {
    const pending = api.extract('exact');
    const date = '2026-07-02T05:45:27.123456+05:30';
    http.expectOne('https://api.test/AI/extract').flush({ [field]: date, amount: '9007199254740993', description: 'Exact', category: 'Food' });
    expect(await pending).toEqual({ date, amount: '9007199254740993', description: 'Exact', category: 'Food' });
  });

  it('rejects when the amount is missing', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount: null, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('rejects when the description is missing', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount: '2.3', description: '   ', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('rejects when the date is missing or unparseable', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ bookingDate: null, date: '2026-10-02', amount: '2.3', description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('propagates the HTTP failure (501 stub until guito-api#69 lands)', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ message: 'stub' }, { status: 501, statusText: 'Not Implemented' });
    await expect(pending).rejects.toBeTruthy();
  });
});
