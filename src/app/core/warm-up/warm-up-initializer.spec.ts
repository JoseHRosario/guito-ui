import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../app-environment';
import { provideWarmUp } from './warm-up-initializer';
import { stubFetch } from './fetch-stub';

const TEST_ENV = { production: false, googleClientId: 'cid', apiBaseUrl: 'https://api.test' };

describe('provideWarmUp (app initializer)', () => {
  it('fires exactly one /warm request to the configured apiBaseUrl at bootstrap', async () => {
    const { fetch, calls, restore } = stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetch;
    try {
      TestBed.configureTestingModule({
        providers: [provideWarmUp(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise;
      expect(calls).toEqual(['https://api.test/warm']);
    } finally {
      restore();
    }
  });

  it('does not block or fail bootstrap when the warm-up fetch rejects', async () => {
    const { fetch, calls, restore } = stubFetch(() => Promise.reject(new TypeError('network down')));
    globalThis.fetch = fetch;
    try {
      TestBed.configureTestingModule({
        providers: [provideWarmUp(), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise; // resolves despite the rejected fetch
      expect(calls).toEqual(['https://api.test/warm']); // one attempt, no retry loop
    } finally {
      restore();
    }
  });
});