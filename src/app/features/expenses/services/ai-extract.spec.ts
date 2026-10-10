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
    req.flush({ date: '2026-10-02', amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).resolves.toEqual({ date: '2026-10-02', amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
  });

  it('retains supplied exact decimal metadata instead of the rounded numeric sibling', async () => {
    const pending = api.extract('exact');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-07-02', amount: 123456789.12345679, amountExact: '123456789.123456789', description: 'Exact', category: 'Food' });
    expect((await pending).amountExact).toBe('123456789.123456789');
  });

  it('rejects invalid supplied exact metadata rather than falling back to rounded amount', async () => {
    const pending = api.extract('exact');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-07-02', amount: 2.3, amountExact: 'bad', description: 'Exact', category: 'Food' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it.each([0, -1.25])('accepts signed/zero proposal amount %s', async amount => {
    const pending = api.extract('signed');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount, description: 'Signed', category: 'Food' });
    expect((await pending).amount).toBe(amount);
  });

  it('rejects when the amount is missing', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount: null, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('rejects when the description is missing', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02', amount: 2.3, description: '   ', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('rejects when the date is missing or unparseable', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: null, amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('propagates the HTTP failure (501 stub until guito-api#69 lands)', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ message: 'stub' }, { status: 501, statusText: 'Not Implemented' });
    await expect(pending).rejects.toBeTruthy();
  });
});
