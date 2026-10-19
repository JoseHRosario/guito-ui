import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';
import { SESSION_STORAGE_KEY } from './auth-session';

it.each(['token', 'refresh'] as const)(
  'reports the actual 35s %s deadline without calling it connectivity or replaying',
  async (action) => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), ms);
      return controller.signal;
    });
    const transport = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    vi.stubGlobal('fetch', transport);
    const auth = setup();
    const operation =
      action === 'token'
        ? auth.completeSignIn({ code: 'one-use', state: 'state' })
        : auth.ensureSession();
    const failure = operation.catch((cause: Error) => cause.message);
    await vi.advanceTimersByTimeAsync(34_999);
    expect(auth.session()?.idToken).toBe('old');
    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toMatch(/timed out.*service.*unavailable/i);
    expect(await failure).not.toMatch(/connection|reach/i);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(auth.session()?.idToken).toBe('old');
  },
);

it.each(['token', 'refresh'] as const)(
  'surfaces explicit service_starting on %s and only retries on user demand',
  async (action) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'service_starting',
            error_description: 'The service is starting. Please try again.',
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(tokens)));
    vi.stubGlobal('fetch', transport);
    const auth = setup();
    const run = () =>
      action === 'token'
        ? auth.completeSignIn({ code: 'one-use', state: 'state' })
        : auth.ensureSession();
    await expect(run()).rejects.toThrow('The service is starting. Please try again.');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(auth.session()?.idToken).toBe('old');
    expect(auth.hasPendingSignIn()).toBe(true);
    expect(await run()).toBe(action === 'token' ? '/budgets' : true);
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

it.each(['temporarily_unavailable', 'service_starting'])(
  'does not infer code safety from a generic 502 (%s)',
  async (error) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ error }), { status: 502 }));
    vi.stubGlobal('fetch', transport);
    const auth = setup();
    await expect(auth.completeSignIn({ code: 'one-use', state: 'state' })).rejects.toThrow();
    await expect(auth.completeSignIn({ code: 'one-use', state: 'state' })).rejects.toThrow(
      /restart.*Google/i,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(auth.hasPendingSignIn()).toBe(true);
  },
);

it('keeps genuine fetch rejection connectivity wording and prevents uncertain code replay after reload', async () => {
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', transport);
  let auth = setup();
  await expect(auth.completeSignIn({ code: 'one-use', state: 'state' })).rejects.toThrow(
    /Could not reach/,
  );
  expect(auth.pendingReturnUrl()).toBe('/budgets');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test' } }],
  });
  auth = TestBed.inject(AuthService);
  await expect(auth.completeSignIn({ code: 'one-use', state: 'state' })).rejects.toThrow(
    /restart.*Google/i,
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

it('uses the same 35s session HTTP budget for best-effort logout without delaying local signout', () => {
  const deadline = vi.spyOn(AbortSignal, 'timeout');
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', transport);
  const auth = setup();
  expect(auth.signOut()).toBe('/signin');
  expect(auth.session()).toBeNull();
  expect(deadline).toHaveBeenCalledWith(35_000);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not resend a queued callback after the first successful exchange cleared pending state', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locks = 0;
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, operation: () => Promise<unknown>) =>
        ++locks === 1 ? operation() : gate.then(operation),
    },
  });
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(tokens)));
  vi.stubGlobal('fetch', transport);
  const auth = setup();
  const first = auth.completeSignIn({ code: 'one-use', state: 'state' });
  const second = auth.completeSignIn({ code: 'one-use', state: 'state' });
  const outcome = second.catch((cause: Error) => cause.message);
  expect(await first).toBe('/budgets');
  release();
  expect(await outcome).toMatch(/restart.*Google/i);
  expect(transport).toHaveBeenCalledTimes(1);
});

const pendingKey = 'guito.auth.pkce';
const tokens = {
  idToken: 'id',
  accessToken: 'at',
  expiresIn: 3600,
  sessionExpiresAt: '2099-01-01T00:00:00Z',
};
function setup() {
  localStorage.setItem('guito.auth.epoch', 'epoch');
  sessionStorage.setItem(
    pendingKey,
    JSON.stringify({ verifier: 'verifier', state: 'state', returnUrl: '/budgets', epoch: 'epoch' }),
  );
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ persistent: true, idToken: 'old', accessToken: 'old', expiresAt: 1 }),
  );
  TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: 'https://api.test' } }],
  });
  return TestBed.inject(AuthService);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.removeItem(pendingKey);
  for (const key of [SESSION_STORAGE_KEY, 'guito.auth.epoch', 'guito.auth.signed-out'])
    localStorage.removeItem(key);
});

it.each(['token', 'refresh'] as const)(
  'accepts a delayed %s response beyond the old 15s deadline without replay',
  async (action) => {
    vi.useFakeTimers();
    // AbortSignal.timeout uses native timers in Node; bind its clock to Vitest.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), ms);
      return controller.signal;
    });
    let finish!: (response: Response) => void;
    let signal!: AbortSignal;
    const transport = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          finish = resolve;
          signal = init!.signal!;
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    vi.stubGlobal('fetch', transport);
    const auth = setup();
    const operation =
      action === 'token'
        ? auth.completeSignIn({ code: 'one-use', state: 'state' })
        : auth.ensureSession();
    const outcome = operation.catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(16_300);
    expect(signal.aborted).toBe(false);
    finish(new Response(JSON.stringify(tokens)));
    expect(await outcome).toBe(action === 'token' ? '/budgets' : true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      `https://api.test/Auth/session/${action}`,
      expect.objectContaining({ credentials: 'include' }),
    );
  },
);
