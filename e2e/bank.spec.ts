import { expect, test, type Page, type Route } from '@playwright/test';

import { stubExpensesApi, SESSION_KEY } from './helpers/stub-auth';

// e2e for the Bank review page (issue #61): `GET /BankTransaction` and
// `POST /BankTransaction/sync` are stubbed at the transport — the API endpoints
// are not implemented yet (guito-api#91/#112); this spec freezes the UI contract.

const STUB_PENDING = [
  { id: 7, bookingDate: '2026-10-02', amount: 123456789.12345679, amountExact: '123456789.123456789', currency: 'EUR', remittanceInformation: 'CONTINENTE ONLINE 8831', suggestedCategoryId: 3, suggestedCategory: 'Shopping' },
  { id: 9, bookingDate: '2026-10-01', amount: 200, currency: 'EUR', remittanceInformation: 'TRF MB WAY PARA MARIA S', suggestedCategory: null },
];

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresAt: Date.now() + 3_600_000 }),
    );
  }, SESSION_KEY);
}

async function stubBankApi(page: Page, rows: object[] = STUB_PENDING): Promise<void> {
  await page.route('**/BankTransaction', (route: Route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.continue();
  });
  await page.route('**/BankTransaction/sync', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fetched: 12, new: 3 }) }),
  );
  await page.route('**/Category', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ categories: [{ name: 'Clothing' }, { name: 'Shopping' }, { name: 'Eating out' }] }),
    }),
  );
}

test.describe('Bank review page (issue #61, stubbed data, signed in)', () => {
  test('mobile: pending rows render grouped and accept prefills the create form', async ({ page }) => {
    await stubExpensesApi(page);
    await stubBankApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/bank');

    await expect(page).toHaveTitle(/Guito · Bank/);
    await expect(page.getByTestId('bank-row').first()).toBeVisible();

    // Bottom nav now carries the 5th Bank tab
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    await expect(bottomNav.getByText('Bank')).toBeVisible();

    const rows = page.locator('[data-testid="bank-row"]:visible');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('CONTINENTE ONLINE 8831');
    await expect(rows.first()).toContainText('Shopping');
    await expect(rows.nth(1)).toContainText('No suggestion');

    // Accept → the existing Create Expense form, prefilled from the bank row
    await rows.first().getByTestId('accept-transaction').click();
    await expect(page).toHaveURL(/\/expenses\/create/);
    const description = page.locator('[data-testid="description-input"]:visible');
    await expect(description).toHaveValue('CONTINENTE ONLINE 8831');
    await expect(page.locator('[data-testid="amount-input"]:visible')).toHaveValue('123456789,123456789');
    await expect(page.locator('[data-testid="category-select"]:visible')).toHaveValue('Shopping');
    let body: Record<string, unknown> | undefined;
    await page.route('**/Expense', async route => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'bank-exact' } });
    });
    await page.locator('[data-testid="save-expense"]:visible').click();
    await expect(page).toHaveURL(/saved=1/);
    expect(body?.['amount']).toBe('123456789.123456789');
    expect(Object.hasOwn(body!, 'occurredAt')).toBe(process.env['GUITO_TIMESTAMPS_ENABLED'] === 'true');
  });

  test('mobile: sync button posts and surfaces the fetched/new result', async ({ page }) => {
    await stubExpensesApi(page);
    await stubBankApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/bank');

    await page.getByTestId('sync-bank').first().click();
    await expect(page.getByTestId('sync-result').first()).toContainText('+3 new');
  });
});
test.describe('Bank link flow (issue #64: linking lives on Settings; Bank page routes there)', () => {
  test('mobile: unlinked empty state offers Open Settings, which routes to the Settings card', async ({ page }) => {
    await stubExpensesApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.route('**/BankTransaction', (route: Route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ title: 'No bank connection' }) });
      }
      return route.continue();
    });
    await page.route('**/BankConnection', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [] }) }),
    );
    await page.route('**/Category', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ categories: [{ name: 'Clothing' }] }) }),
    );
    await page.goto('/bank');

    const empty = page.locator('[data-testid="bank-empty"]:visible');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No bank connected — open Settings to link your bank.');

    await empty.locator('[data-testid="open-settings"]').click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('[data-testid="link-bank"]:visible')).toBeVisible();
  });

  test('mobile: landing from the consent callback (?linked=1) confirms and shows the pending list', async ({ page }) => {
    await stubExpensesApi(page);
    await stubBankApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.route('**/BankConnection', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accounts: [{ name: 'Conta Casa', ibanMasked: '•••• 1234', consentStatus: 'VALID' }] }),
      }),
    );
    await page.goto('/bank?linked=1');

    await expect(page.locator('[data-testid="bank-linked-confirm"]:visible')).toContainText('Bank connected — 1 account linked.');
    await expect(page.locator('[data-testid="bank-row"]:visible').first()).toBeVisible();
  });

  test('mobile: Settings "Link your bank" redirects the tab to the EB consent URL', async ({ page }) => {
    await stubExpensesApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.route('**/BankConnection', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [] }) }),
    );
    await page.route('**/BankAuth/url*', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://consent.eb.test/authorize' }) }),
    );
    await page.route('https://consent.eb.test/**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>EB consent</h1>' }),
    );
    await page.goto('/settings');

    await expect(page.locator('[data-testid="bank-status"]:visible')).toContainText('No bank connected');
    await page.locator('[data-testid="link-bank"]:visible').click();
    await expect(page).toHaveURL('https://consent.eb.test/authorize');
  });
});
