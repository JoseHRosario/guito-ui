import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { SESSION_KEY, stubGoogleAuthorize } from './helpers/stub-auth';

const tokens = {
  idToken: 'id',
  accessToken: 'at',
  expiresIn: 3600,
  sessionExpiresAt: '2099-01-01T00:00:00Z',
};
async function prepare(page: Page, context: BrowserContext, action: 'token' | 'refresh') {
  await context.route('https://**', (route) => route.abort());
  await page.clock.install();
  await page.addInitScript((action) => {
    // Native AbortSignal.timeout is not controlled by Playwright's JS clock.
    // Keep the real AbortController/fetch, substituting only its timer source.
    AbortSignal.timeout = (ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), ms);
      return controller.signal;
    };
    if (sessionStorage.getItem('cold-auth-seeded')) return;
    sessionStorage.setItem('cold-auth-seeded', '1');
    localStorage.setItem('guito.auth.epoch', 'epoch');
    if (action === 'token') {
      sessionStorage.setItem(
        'guito.auth.pkce',
        JSON.stringify({
          verifier: 'verifier',
          state: 'state',
          epoch: 'epoch',
          returnUrl: '/budgets?source=cold',
        }),
      );
    } else {
      localStorage.setItem(
        'guito.auth.session',
        JSON.stringify({ persistent: true, idToken: 'old', accessToken: 'old', expiresAt: 1 }),
      );
    }
  }, action);
}
const entry = (action: 'token' | 'refresh') =>
  action === 'token'
    ? '/auth/callback?code=one-use&state=state'
    : '/auth/renew?returnUrl=%2Fbudgets%3Fsource%3Dcold';

for (const action of ['token', 'refresh'] as const) {
  test(`${action}: delayed response after 16.3s succeeds without automatic replay`, async ({
    page,
    context,
  }) => {
    await prepare(page, context, action);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await context.route(`**/Auth/session/${action}`, async (route) => {
      requests++;
      await gate;
      await route.fulfill({ json: tokens });
    });
    await page.goto(entry(action));
    await expect.poll(() => requests).toBe(1);
    await page.clock.runFor(16_300);
    await expect(page.getByTestId('auth-error')).toHaveCount(0);
    release();
    await expect(page).toHaveURL(/budgets\?source=cold$/);
    await expect(page.getByTestId('header-avatar')).toBeVisible();
    expect(requests).toBe(1);
  });

  test(`${action}: actual deadline is not connectivity and never automatically replays`, async ({
    page,
    context,
  }) => {
    await prepare(page, context, action);
    let requests = 0;
    let googleRequests = 0;
    await context.route(`**/Auth/session/${action}`, () => {
      requests++;
    });
    context.on('request', (request) => {
      if (request.url().startsWith('https://accounts.google.com/')) googleRequests++;
    });
    await page.goto(entry(action));
    await expect.poll(() => requests).toBe(1);
    // Unit fake timers assert the exact 34,999/35,000 boundary. Leave margin
    // for real render/network scheduling around the built-browser clock.
    await page.clock.runFor(36_000);
    await expect(page.getByTestId('auth-error')).toContainText(
      'timed out. The service may be unavailable.',
    );
    await expect(page.getByTestId('auth-error')).not.toContainText('connection');
    await page.clock.runFor(70_000);
    expect(requests).toBe(1);
    expect(googleRequests).toBe(0);
    if (action === 'refresh') {
      expect(
        await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).idToken, SESSION_KEY),
      ).toBe('old');
    }
  });

  test(`${action}: startup 503 uses existing card and only explicit retry resumes`, async ({
    page,
    context,
  }) => {
    await prepare(page, context, action);
    let requests = 0;
    const bodies: string[] = [];
    await context.route(`**/Auth/session/${action}`, (route) => {
      requests++;
      bodies.push(route.request().postData()!);
      return route.fulfill(
        requests === 1
          ? {
              status: 503,
              json: {
                error: 'service_starting',
                error_description: 'The service is starting. Please try again.',
              },
            }
          : { json: tokens },
      );
    });
    await page.goto(entry(action));
    await expect(page.getByTestId('auth-error')).toContainText('Service starting');
    await expect(page.getByTestId('auth-error')).toContainText(
      'The service is starting. Please try again.',
    );
    await page.clock.runFor(70_000);
    expect(requests).toBe(1);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page).toHaveURL(/budgets\?source=cold$/);
    await expect(page.getByTestId('header-avatar')).toBeVisible();
    expect(requests).toBe(2);
    expect(bodies[1]).toBe(bodies[0]);
  });
}

test('a popup display marker is not proof that an uncertain code can be reused', async ({
  page,
  context,
}) => {
  await prepare(page, context, 'token');
  let requests = 0;
  await context.route('**/Auth/session/token', (route) => {
    requests++;
    return route.fulfill({ status: 503, json: { error: 'temporarily_unavailable' } });
  });
  await page.goto(entry('token'));
  await expect(page.getByTestId('auth-error')).toContainText('temporarily_unavailable');
  await page.goto(`${entry('token')}&sessionError=service_starting`);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('auth-error')).toContainText('Please restart with Google.');
  expect(requests).toBe(1);
});

test('popup startup failure lands on the same card without a second exchange or Google flow, then explicitly retries', async ({
  page,
  context,
}) => {
  await context.route('https://**', (route) => route.abort());
  await page.goto('/signin?returnUrl=%2Fbudgets%3Fsource%3Dcold');
  await stubGoogleAuthorize(context, new URL(page.url()).origin);
  let requests = 0;
  const bodies: string[] = [];
  await context.route('**/Auth/session/token', (route) => {
    requests++;
    bodies.push(route.request().postData()!);
    return route.fulfill(
      requests === 1 ? { status: 503, json: { error: 'service_starting' } } : { json: tokens },
    );
  });
  await page.getByTestId('signin-button').click();
  await expect(page.getByTestId('auth-error')).toContainText('Service starting');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/budgets\?source=cold$/);
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  expect(requests).toBe(2);
  expect(bodies[1]).toBe(bodies[0]);
});

test('generic 503 restarts Google only on user retry, never replays the uncertain code', async ({
  page,
  context,
}) => {
  await prepare(page, context, 'token');
  let requests = 0;
  const codes: string[] = [];
  await context.route('**/Auth/session/token', (route) => {
    requests++;
    codes.push(route.request().postDataJSON().code as string);
    return route.fulfill(
      requests === 1
        ? { status: 503, json: { error: 'temporarily_unavailable' } }
        : { json: tokens },
    );
  });
  await page.goto(entry('token'));
  await expect(page.getByTestId('auth-error')).toContainText('temporarily_unavailable');
  await expect(page.getByTestId('auth-error')).not.toContainText('Service starting');
  await page.clock.runFor(70_000);
  expect(requests).toBe(1);
  await stubGoogleAuthorize(context, new URL(page.url()).origin);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/budgets\?source=cold$/);
  expect(requests).toBe(2);
  expect(codes[0]).toBe('one-use');
  expect(codes[1]).not.toBe('one-use');
});
