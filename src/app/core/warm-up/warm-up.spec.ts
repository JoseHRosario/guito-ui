import { warmUpApi } from './warm-up';
import { stubFetch } from './fetch-stub';

describe('warmUpApi', () => {
  it('issues exactly one GET to {apiBaseUrl}/warm (issue #59)', async () => {
    const { fetch, calls } = stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })));
    await warmUpApi('https://api.test', fetch);
    expect(calls).toEqual(['https://api.test/warm']);
  });

  it('swallows a rejected fetch — resolves, no retry, no second call', async () => {
    const { fetch, calls } = stubFetch(() => Promise.reject(new TypeError('network down')));
    await expect(warmUpApi('https://api.test', fetch)).resolves.toBeUndefined();
    expect(calls).toEqual(['https://api.test/warm']);
  });
});