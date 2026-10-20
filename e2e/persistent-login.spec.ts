import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  SESSION_KEY,
  stubExpensesApi,
  stubSessionRefresh,
  stubGoogleAuthorize,
  stubTokenExchange,
} from './helpers/stub-auth';

const tokens = {
  idToken: 'renewed-id',
  accessToken: 'access',
  expiresIn: 3600,
  sessionExpiresAt: '2099-01-01T00:00:00Z',
};
async function prepare(page: Page, context: BrowserContext): Promise<void> {
  // No unconfigured remote transport can touch real Google or the API.
  await context.route('https://**', (route) => route.abort());
  await stubExpensesApi(context);
  await page.goto('/signin');
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ persistent: true, idToken: 'expired', accessToken: 'old', expiresAt: 1 }),
      ),
    SESSION_KEY,
  );
}

test('expired bootstrap cache renews and survives a new tab/reload without Google', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  let renewals = 0;
  await context.route('**/Auth/session/refresh', (route) => {
    renewals++;
    return route.fulfill({ json: tokens });
  });
  await page.goto('/dashboard?source=restart');
  await expect(page).toHaveURL(/dashboard\?source=restart$/);
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  const reopened = await context.newPage();
  await reopened.goto('/budgets');
  await expect(reopened.getByTestId('header-avatar')).toBeVisible();
  expect(renewals).toBe(1); // bounded recent foreground success shared by tabs
});

test('temporary bootstrap failure shows the existing retry card, preserves credentials and restores the requested route', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  let available = false;
  await context.route('**/Auth/session/refresh', (route) =>
    route.fulfill({
      status: available ? 200 : 503,
      json: available ? tokens : { error: 'temporarily_unavailable' },
    }),
  );
  await page.goto('/budgets?source=offline');
  await expect(page.getByTestId('auth-error')).toContainText('Session renewal failed');
  await expect(page).toHaveURL(/auth\/renew\?returnUrl=/);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).idToken, SESSION_KEY),
  ).toBe('expired');
  await expect(page.getByTestId('signin-button')).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/budgets\?source=offline$/);
  await expect(page.getByTestId('header-avatar')).toBeVisible();
});

test('foreground renewal failure is retryable and never masquerades as Google sign-in', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  let available = true;
  await context.route('**/Auth/session/refresh', (route) =>
    route.fulfill({
      status: available ? 200 : 502,
      json: available ? tokens : { error: 'temporarily_unavailable' },
    }),
  );
  await page.goto('/dashboard?source=foreground');
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  available = false;
  await page.evaluate((key) => {
    const cached = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...cached, refreshedAt: 1 }));
    // Real app initializer registration; controlled lifecycle event, not a live Android claim.
    document.dispatchEvent(new Event('visibilitychange'));
  }, SESSION_KEY);
  await expect(page.getByTestId('auth-error')).toContainText('Session renewal failed');
  await expect(page.getByTestId('signin-button')).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/dashboard\?source=foreground$/);
});

test('permanent expiry routes to login retaining only the requested route, not a draft', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await context.route('**/Auth/session/refresh', (route) =>
    route.fulfill({ status: 401, json: { error: 'session_expired' } }),
  );
  await page.goto('/expenses/create?source=expired');
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/expenses/create?source=expired');
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
});

test('legacy token-only caches require a fresh login without attempting cookie refresh', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  let renewals = 0;
  await context.route('**/Auth/session/refresh', (route) => {
    renewals++;
    return route.fulfill({ json: tokens });
  });
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          idToken: 'legacy',
          accessToken: 'legacy',
          expiresAt: Date.now() + 3600000,
        }),
      ),
    SESSION_KEY,
  );
  await page.goto('/budgets');
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(renewals).toBe(0);
});

test('logout is immediate, propagates to another tab, and offline cookie failure cannot resurrect on reload', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await stubSessionRefresh(context);
  let logoutRequests = 0;
  await context.route('**/Auth/session/logout', (route) => {
    logoutRequests++;
    return route.abort();
  });
  await page.goto('/dashboard');
  const other = await context.newPage();
  await other.goto('/budgets');
  await expect(other.getByTestId('header-avatar')).toBeVisible();
  await page.getByTestId('header-avatar').click();
  await page.getByTestId('sign-out').click();
  await expect(page.getByTestId('signin-button')).toBeVisible();
  await other.bringToFront();
  await expect(other.getByTestId('signin-button')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(logoutRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('guito.auth.signed-out'))).toBe('1');
});

for (const status of [401, 500]) {
  test(`financial POST returning ${status} is never replayed after pre-request renewal`, async ({
    page,
    context,
  }) => {
    await prepare(page, context);
    await stubSessionRefresh(context);
    await context.route('**/Category', (route) =>
      route.fulfill({ json: { categories: [{ name: 'Food' }] } }),
    );
    let posts = 0;
    await context.route('**/Expense', (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['authorization']).toBe('Bearer e2e-id');
      expect(route.request().headers()['x-google-idtoken']).toBe('e2e-id');
      posts++;
      return route.fulfill({ status, json: { message: 'Failed once' } });
    });
    await page.goto('/expenses/create');
    await page.getByTestId('amount-input').filter({ visible: true }).fill('1,23');
    await page
      .getByTestId('description-input')
      .filter({ visible: true })
      .fill('One deliberate save');
    await page.getByTestId('category-select').filter({ visible: true }).selectOption('Food');
    // Force renewal between editing and the single deliberate Save click.
    await page.evaluate((key) => {
      const s = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...s, expiresAt: 1 }));
    }, SESSION_KEY);
    await page.getByTestId('save-expense').filter({ visible: true }).click();
    await expect(page.getByTestId('save-error').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('save-expense').filter({ visible: true })).toBeEnabled();
    expect(posts).toBe(1);
  });
}

test('genuine reauthentication restores Create route but loses unsaved fields, and signs in an already open sibling tab', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await stubSessionRefresh(context);
  await context.route('**/Category', (route) =>
    route.fulfill({ json: { categories: [{ name: 'Food' }] } }),
  );
  await page.goto('/expenses/create');
  await page.getByTestId('amount-input').filter({ visible: true }).fill('99,99');
  await page
    .getByTestId('description-input')
    .filter({ visible: true })
    .fill('Unsaved private draft');
  await context.route('**/Auth/session/refresh', (route) =>
    route.fulfill({ status: 401, json: { error: 'session_expired' } }),
  );
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...s, expiresAt: 1 }));
    document.dispatchEvent(new Event('visibilitychange'));
  }, SESSION_KEY);
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/expenses/create');
  const sibling = await context.newPage();
  await sibling.goto('/budgets');
  await expect(sibling.getByTestId('signin-button')).toBeVisible();
  await stubGoogleAuthorize(context, new URL(page.url()).origin);
  await stubTokenExchange(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByTestId('signin-button').click();
  await expect(page).toHaveURL(/expenses\/create$/);
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toHaveValue('');
  await expect(page.getByTestId('description-input').filter({ visible: true })).toHaveValue('');
  await sibling.bringToFront();
  await expect(sibling).toHaveURL(/budgets$/);
  await expect(sibling.getByTestId('header-avatar')).toBeVisible();
});

test('same-browser tabs serialize and coalesce concurrent renewal with a native Web Lock', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let renewals = 0;
  await context.route('**/Auth/session/refresh', async (route) => {
    renewals++;
    await gate;
    await route.fulfill({ json: tokens });
  });
  await page.goto('/dashboard');
  await expect.poll(() => renewals).toBe(1);
  const sibling = await context.newPage();
  await sibling.goto('/budgets');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.length))
    .toBe(1);
  release();
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  await expect(sibling.getByTestId('header-avatar')).toBeVisible();
  expect(renewals).toBe(1);
});

test('logout waits behind in-flight cookie renewal but clears local auth immediately and cannot be resurrected', async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await stubSessionRefresh(context);
  await page.goto('/dashboard');
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshStarted = false;
  let logoutRequests = 0;
  await context.route('**/Auth/session/refresh', async (route) => {
    refreshStarted = true;
    await gate;
    await route.fulfill({ json: tokens });
  });
  await context.route('**/Auth/session/logout', (route) => {
    logoutRequests++;
    return route.fulfill({ status: 204 });
  });
  await page.getByTestId('header-avatar').click();
  await page.evaluate((key) => {
    const cached = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...cached, refreshedAt: 1 }));
    document.dispatchEvent(new Event('visibilitychange'));
  }, SESSION_KEY);
  await expect.poll(() => refreshStarted).toBe(true);
  await page.getByTestId('sign-out').click();
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(logoutRequests).toBe(0);
  release();
  await expect.poll(() => logoutRequests).toBe(1);
  await expect(page.getByTestId('signin-button')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByTestId('signin-button')).toBeVisible();
});
