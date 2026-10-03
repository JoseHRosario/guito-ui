import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../app-environment';
import { ApiVersionService } from './api-version-service';
import { provideApiVersion } from './api-version-initializer';

const TEST_ENV = { production: false, googleClientId: 'cid', apiBaseUrl: 'https://api.test', version: '0.0.0-dev' };

function fakeFetch(behavior: (url: string) => Promise<Response>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fake = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    return behavior(url);
  }) as typeof fetch;
  return { fetch: fake, calls };
}

describe('ApiVersionService', () => {
  let service: ApiVersionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiVersionService);
  });

  afterEach(() => {
    service.version.set(undefined);
  });

  it('captures the X-Api-Version response header from GET /healthz', async () => {
    const { fetch, calls } = fakeFetch(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'X-Api-Version': '0.1.0-beta.7+20261003T120000Z.abc1234' } })),
    );
    await service.capture('https://api.test', fetch);
    expect(calls).toEqual(['https://api.test/healthz']);
    expect(service.version()).toBe('0.1.0-beta.7+20261003T120000Z.abc1234');
  });

  it('stays undefined when the header is missing (pre-#75 API deployed)', async () => {
    const { fetch } = fakeFetch(() => Promise.resolve(new Response('{}', { status: 200 })));
    await service.capture('https://api.test', fetch);
    expect(service.version()).toBeUndefined();
  });

  it('stays undefined and resolves when the fetch rejects — no bootstrap failure, no retry', async () => {
    const { fetch, calls } = fakeFetch(() => Promise.reject(new TypeError('network down')));
    await expect(service.capture('https://api.test', fetch)).resolves.toBeUndefined();
    expect(calls).toEqual(['https://api.test/healthz']);
    expect(service.version()).toBeUndefined();
  });
});

describe('provideApiVersion (app initializer)', () => {
  afterEach(() => {
    vi.unstubAllGlobals(); // isolate: false — a leaked globalThis.fetch would bleed into later spec files
  });

  it('captures the API version once at bootstrap against the configured apiBaseUrl', async () => {
    const { fetch, calls } = fakeFetch(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'X-Api-Version': '1.2.3' } })),
    );
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [provideApiVersion(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(calls).toEqual(['https://api.test/healthz']);
    expect(TestBed.inject(ApiVersionService).version()).toBe('1.2.3');
  });

  it('does not block or fail bootstrap when the capture fetch rejects', async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError('network down')));
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [provideApiVersion(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise; // resolves despite the rejected fetch
    expect(TestBed.inject(ApiVersionService).version()).toBeUndefined();
  });
});
