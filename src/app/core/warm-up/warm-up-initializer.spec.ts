import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../app-environment';
import { ApiVersionService } from '../api-version/api-version-service';
import { provideWarmUp } from './warm-up-initializer';
import { stubFetch } from './fetch-stub';

const TEST_ENV = { production: false, googleClientId: 'cid', apiBaseUrl: 'https://api.test', version: '0.0.0-dev' };

describe('provideWarmUp (app initializer)', () => {
  it('fires exactly ONE /warm request at bootstrap and feeds its version header to ApiVersionService (issue #59)', async () => {
    const { fetch, calls, restore } = stubFetch(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'X-Api-Version': '1.2.3' } })),
    );
    globalThis.fetch = fetch;
    try {
      TestBed.configureTestingModule({
        providers: [provideWarmUp(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise;
      // The capture is fire-and-forget: its .then settles in microtasks after
      // the initializer resolves — one macrotask before asserting.
      await new Promise((r) => setTimeout(r, 0));
      // The single bootstrap call serves BOTH jobs: warm-up + version capture.
      expect(calls).toEqual(['https://api.test/warm']);
      expect(TestBed.inject(ApiVersionService).version()).toBe('1.2.3');
    } finally {
      restore();
    }
  });

  it('does not block or fail bootstrap when the warm-up fetch rejects — version stays undefined', async () => {
    const { fetch, calls, restore } = stubFetch(() => Promise.reject(new TypeError('network down')));
    globalThis.fetch = fetch;
    try {
      TestBed.configureTestingModule({
        providers: [provideWarmUp(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise; // resolves despite the rejected fetch
      expect(calls).toEqual(['https://api.test/warm']); // one attempt, no retry loop
      expect(TestBed.inject(ApiVersionService).version()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('leaves the version undefined when the response carries no version header (pre-#75 API)', async () => {
    const { fetch, restore } = stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetch;
    try {
      TestBed.configureTestingModule({
        providers: [provideWarmUp(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise;
      expect(TestBed.inject(ApiVersionService).version()).toBeUndefined();
    } finally {
      restore();
    }
  });
});