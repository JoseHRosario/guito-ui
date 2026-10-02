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
    req.flush({ date: '2026-10-02T00:00:00Z', amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).resolves.toEqual({ date: '2026-10-02', amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
  });

  it('rejects when the amount is missing or not positive (ADR 0010)', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02T00:00:00Z', amount: 0, description: 'Coco Verde', category: 'Eating out' });
    await expect(pending).rejects.toThrow('extract-unusable');
  });

  it('rejects when the description is missing', async () => {
    const pending = api.extract('café');
    http.expectOne('https://api.test/AI/extract').flush({ date: '2026-10-02T00:00:00Z', amount: 2.3, description: '   ', category: 'Eating out' });
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
