import { expect, test, type Page, type Route } from '@playwright/test';
import { stubExpensesApi, SESSION_KEY } from './helpers/stub-auth';

// Hermetic browser seam: no real bank or expense writes.
const STUB_PENDING = [
  { id: '9223372036854775807', accountUid: 'test-account', bookingDate: '2026-10-02', amount: '58.93', currency: 'EUR', status: 'BOOK', reviewStatus: 'needsReview', remittanceInformation: 'CONTINENTE ONLINE 8831', suggestedCategory: { id: 3, name: 'Shopping' }, linkedExpense: null },
  { id: 8, accountUid: 'test-account', bookingDate: '2026-10-01', amount: '12.4', currency: 'EUR', status: 'BOOK', reviewStatus: 'ignored', remittanceInformation: 'MB WAY PURCHASE 4477 LISBOA', suggestedCategory: null, linkedExpense: null },
  { id: 9, accountUid: 'test-account', bookingDate: '2026-10-01', amount: '200', currency: 'EUR', status: 'BOOK', reviewStatus: 'matched', remittanceInformation: 'TRF MB WAY PARA MARIA S', suggestedCategory: null, linkedExpense: { id: 12, bookingDate: '2026-10-01T23:30:00+00:00', amount: '200', currency: 'EUR', description: 'Expense paid', category: 'Bills' } },
];
async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresAt: Date.now() + 3_600_000 })), SESSION_KEY);
}
// A JavaScript fixture cannot represent Int64.MaxValue as a Number. Emit the
// literal numeric token used by .NET, rather than hiding precision loss with strings.
function bankBody(value: unknown): string {
  return JSON.stringify(value).replaceAll('"id":"9223372036854775807"', '"id":9223372036854775807');
}
async function stubBankApi(page: Page): Promise<void> {
  await page.route('**/BankTransaction/**', route => route.fulfill({ status: 501, json: { title: 'Unconfigured bank test transport' } }));
  await page.route('**/BankTransaction', route => route.fulfill({ contentType: 'application/json', body: bankBody(STUB_PENDING) }));
  await page.route('**/BankTransaction/sync', route => route.fulfill({ json: { fetched: 12, new: 3 } }));
}

test.describe('Bank review inbox (#133, stubbed, signed in)', () => {
  test.use({ timezoneId: 'America/New_York' });
  for (const viewport of [{ name: 'mobile', width: 402, height: 874 }, { name: 'desktop', width: 1440, height: 1033 }]) {
    test(`${viewport.name}: initial collapsed list, keyboard toggle, filters and inline actions`, async ({ page }) => {
      await stubExpensesApi(page); await stubBankApi(page); await seedSession(page);
      await page.setViewportSize(viewport); await page.goto('/bank');
      await expect(page).toHaveTitle(/Guito · Bank/);
      const rows = page.locator('[data-testid="bank-row"]:visible');
      const filters = page.locator('[data-testid="bank-filter"]:visible');
      const details = page.locator('[data-testid="bank-details"]:visible');
      await expect(rows).toHaveCount(3);
      await expect(filters.first()).toHaveAttribute('aria-pressed', 'true');
      const filterTops = await filters.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
      expect(new Set(filterTops).size, JSON.stringify(await filters.evaluateAll(buttons => buttons.map(button => ({ text: button.textContent, width: button.getBoundingClientRect().width }))))).toBe(1);
      await expect(details).toHaveCount(0);
      await expect(rows.first().getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'false');
      await expect(rows.first()).toContainText('Needs review · No suggested matches');
      await expect(rows.first().getByTestId('bank-amount')).toHaveText(/-58,93[ .\u00a0\u202f]€/);
      await expect(rows.nth(1)).toHaveAttribute('data-tx-id', '9');
      await expect(rows.nth(2)).toHaveAttribute('data-tx-id', '8');
      await expect(page.locator('[data-tx-id="9"]')).toContainText('Expense paid');
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `test-results/bank-review-${viewport.name}-initial.png`, fullPage: true });
      const first = rows.first().getByTestId('bank-row-toggle');
      await first.focus(); await first.press('Enter');
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await expect(details).toContainText('No suggested matches');
      await expect(details).not.toContainText('BOOK');
      await expect(details.getByTestId('bank-action')).toHaveText('Ignore');
      await page.screenshot({ path: `test-results/bank-review-${viewport.name}-needs-review.png`, fullPage: true });
      await page.locator('[data-tx-id="8"]').getByTestId('bank-row-toggle').click();
      await expect(first).toHaveAttribute('aria-expanded', 'false');
      await expect(details).toHaveCount(1);
      await expect(details.getByTestId('bank-action')).toHaveText('Return to review');
      await page.screenshot({ path: `test-results/bank-review-${viewport.name}-ignored.png`, fullPage: true });
      await page.locator('[data-tx-id="9"]').getByTestId('bank-row-toggle').click();
      await expect(details).toHaveCount(1);
      await expect(details).toContainText('02/10/2026');
      await expect(details).toContainText('00:30');
      await expect(details).toContainText('Bills');
      await expect(details.getByTestId('bank-action')).toHaveCount(0);
      await page.screenshot({ path: `test-results/bank-review-${viewport.name}-matched.png`, fullPage: true });
      await page.locator('[data-tx-id="9"]').getByTestId('bank-row-toggle').press('Space');
      await expect(details).toHaveCount(0);
      for (const index of [1, 2, 3]) {
        await filters.nth(index).click();
        await expect(filters.nth(index)).toHaveAttribute('aria-pressed', 'true');
        await expect(rows).toHaveCount(1);
        await expect(details).toHaveCount(0);
      }
      await filters.first().click();
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toHaveAttribute('data-tx-id', '9223372036854775807');
      await rows.first().getByTestId('bank-row-toggle').click();
      await expect(details.getByTestId('bank-action')).toHaveText('Ignore');
      let requests = 0;
      await page.route('**/BankTransaction/9223372036854775807/ignore', async route => {
        requests++;
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({});
        await route.fulfill({ contentType: 'application/json', body: bankBody({ ...STUB_PENDING[0], reviewStatus: 'ignored' }) });
      });
      await details.getByTestId('bank-action').click();
      await expect(details.getByTestId('bank-action')).toHaveText('Return to review');
      expect(requests).toBe(1);
      await expect(page).toHaveURL(/\/bank$/);
      await page.route('**/BankTransaction/9223372036854775807/review', async route => {
        expect(route.request().postDataJSON()).toEqual({});
        await route.fulfill({ contentType: 'application/json', body: bankBody(STUB_PENDING[0]) });
      });
      await details.getByTestId('bank-action').click();
      await expect(details.getByTestId('bank-action')).toHaveText('Ignore');
      await expect(rows.first()).toContainText('Needs review');
    });
  }
  test('mobile: loading, list Retry and failed action keep financial state unchanged', async ({ page }) => {
    await stubExpensesApi(page); await stubBankApi(page); await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    let finishInitial!: () => void;
    const gate = new Promise<void>(resolve => { finishInitial = resolve; });
    await page.route('**/BankTransaction', async route => {
      await gate;
      await route.fulfill({ status: 500, json: { title: 'Unavailable' } });
    });
    await page.goto('/bank');
    await expect(page.locator('[data-testid="bank-loading"]:visible')).toBeVisible();
    finishInitial();
    await expect(page.locator('[data-testid="bank-error"]:visible')).toBeVisible();
    await page.route('**/BankTransaction', route => route.fulfill({ contentType: 'application/json', body: bankBody(STUB_PENDING) }));
    await page.locator('[data-testid="bank-retry"]:visible').click();
    const row = page.locator('[data-testid="bank-row"]:visible').first();
    await expect(row).toHaveAttribute('data-tx-id', '9223372036854775807');
    await row.getByTestId('bank-row-toggle').click();
    await page.route('**/BankTransaction/9223372036854775807/ignore', route => route.fulfill({ status: 500, json: { title: 'Unavailable' } }));
    await row.getByTestId('bank-action').click();
    await expect(row.getByTestId('bank-row-error')).toContainText('Could not update');
    await expect(row.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toContainText('Needs review');
    await expect(row.getByTestId('bank-action')).toHaveText('Ignore');
  });

  test('mobile: sync POST surfaces fetched/new result', async ({ page }) => {
    await stubExpensesApi(page); await stubBankApi(page); await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 }); await page.goto('/bank');
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
