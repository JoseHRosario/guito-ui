import { expect, test, type Page } from '@playwright/test';
import { SESSION_KEY } from './helpers/stub-auth';

const ID = '9223372036854775807';
const candidates = [
  { id: 20, description: 'Continente groceries', bookingDate: '2026-10-02T18:25:00+01:00' },
  { id: 21, description: 'Continente weekly shop', bookingDate: '2026-10-01T19:10:00+01:00' },
  { id: 22, description: 'Household groceries', bookingDate: '2026-10-04T17:40:00+01:00' },
  { id: 23, description: 'Other groceries', bookingDate: '2026-10-02T23:30:00+00:00' },
  { id: 24, description: 'Exact amount', bookingDate: '2026-10-01T12:00:00+01:00', amount: '9999999999999999.99' },
].map(row => ({ amount: '58.93', currency: 'EUR', category: 'Shopping', ...row }));
const initial = [
  { id: '7', bookingDate: '2026-10-04', remittanceInformation: 'RESTAURANTE JARDIM', amount: '24.50', reviewStatus: 'needsReview', suggestedExpenseCount: 0 },
  { id: '8', bookingDate: '2026-10-03', remittanceInformation: 'METRO LISBOA', amount: '1.80', reviewStatus: 'needsReview', suggestedExpenseCount: 0 },
  { id: ID, bookingDate: '2026-10-02', remittanceInformation: 'CONTINENTE ONLINE 8831', amount: '58.93', reviewStatus: 'needsReview', suggestedExpenseCount: 5 },
  { id: '9', bookingDate: '2026-10-02', remittanceInformation: 'SPOTIFY PORTUGAL', amount: '8.99', reviewStatus: 'matched', suggestedExpenseCount: 0, linkedExpense: { ...candidates[0], id: 12, description: 'Spotify subscription', amount: '8.99', category: 'Entertainment', bookingDate: '2026-10-02T09:00:00+01:00' } },
  { id: '10', bookingDate: '2026-10-01', remittanceInformation: 'TRF MB WAY PARA MARIA S', amount: '200', reviewStatus: 'ignored', suggestedExpenseCount: 0 },
].map(row => ({ currency: 'EUR', status: 'BOOK', linkedExpense: null, ...row }));
const bankBody = (value: unknown) => JSON.stringify(value).replaceAll(`"id":"${ID}"`, `"id":${ID}`);

async function transport(page: Page) {
  let rows = structuredClone(initial);
  const writes: string[] = [];
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', persistent: true, sessionExpiresAt: '2099-01-01T00:00:00Z', refreshedAt: Date.now(), expiresAt: Date.now() + 3600000 })), SESSION_KEY);
  // Catch every financial request: a forgotten fake can never fall through to live API.
  await page.route('**/Expense**', route => route.fulfill({ status: 501, body: 'Unconfigured Expense transport' }));
  await page.route('**/BankTransaction**', route => route.fulfill({ status: 501, body: 'Unconfigured Bank transport' }));
  await page.route('**/BankTransaction', route => route.fulfill({ contentType: 'application/json', body: bankBody(rows) }));
  await page.route('**/BankTransaction/*/suggestions', route => route.fulfill({ json: candidates }));
  await page.route('**/Expense/history?*', route => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    const expenses = index === 0 ? [candidates[2], { ...candidates[0], id: 13, description: 'Coffee with Ana', amount: '4.20', category: 'Snacks', bookingDate: '2026-10-03T10:15:00+01:00' }, candidates[0], initial[3].linkedExpense!, candidates[1]] : [candidates[3]];
    return route.fulfill({ json: { pageSize: 100, pageIndex: index, totalCount: 6, hasMore: index === 0, expenses } });
  });
  for (const action of ['match', 'unmatch']) {
    await page.route(`**/BankTransaction/${ID}/${action}`, route => {
      writes.push(action);
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ expenseId: 20 });
      rows = rows.map(row => row.id !== ID ? row : { ...row, reviewStatus: action === 'match' ? 'matched' : 'needsReview', suggestedExpenseCount: action === 'match' ? 0 : 5, linkedExpense: action === 'match' ? candidates[0] : null });
      return route.fulfill({ contentType: 'application/json', body: bankBody(rows.find(row => row.id === ID)) });
    });
  }
  return { writes };
}

for (const viewport of [{ name: 'mobile', width: 402, height: 874 }, { name: 'desktop', width: 1440, height: 1033 }]) {
  test(`${viewport.name}: approved matching, history and explicit reversible existing-Expense link`, async ({ page }) => {
    const { writes } = await transport(page);
    await page.setViewportSize(viewport); await page.goto('/bank');
    const row = page.locator(`[data-tx-id="${ID}"]`);
    const details = page.getByTestId('bank-details');
    await expect(page.getByTestId('bank-row')).toHaveCount(5);
    await expect(page.getByTestId('bank-filter').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(details).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    await page.screenshot({ path: `test-results/matching-${viewport.name}-initial.png`, fullPage: true });
    await row.getByTestId('bank-row-toggle').click();
    await expect(details.getByTestId('match-expense')).toHaveCount(3);
    await expect(details).not.toContainText('BOOK');
    await expect(details).not.toContainText('Currency');
    await expect(details.getByTestId('show-more-suggestions')).toHaveText('Show more (2)');
    await row.evaluate(el => {
      const scroll = el.closest('.review-scroll')!;
      scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 48;
    });
    await page.screenshot({ path: `test-results/matching-${viewport.name}-candidates.png`, fullPage: true });
    await details.getByTestId('show-more-suggestions').click();
    await expect(details.getByTestId('match-expense')).toHaveCount(5);
    await expect(details.locator('[data-candidate-id="24"]')).toContainText(/-9[\s]999[\s]999[\s]999[\s]999[\s]999,99/);
    if (viewport.name === 'mobile') {
      const bankScroll = page.getByRole('region', { name: 'Bank Transaction list', exact: true });
      await bankScroll.evaluate(el => { el.scrollTop = 150; });
      const top = await bankScroll.evaluate(el => el.scrollTop);
      await page.getByRole('button', { name: 'Expenses', exact: true }).click();
      await expect(page.getByTestId('expense-history')).toBeVisible();
      await expect(page.getByTestId('expense-history').locator('[data-history-id="20"]')).toContainText('Suggested');
      await page.screenshot({ path: 'test-results/matching-mobile-history.png', fullPage: true });
      await page.getByRole('button', { name: 'Load older Expenses' }).click();
      await expect(page.locator('[data-history-id="23"]')).toBeVisible();
      await page.getByRole('button', { name: 'Transactions', exact: true }).click();
      await expect(row.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
      expect(await bankScroll.evaluate(el => el.scrollTop)).toBe(top);
      await expect(details.getByTestId('match-expense')).toHaveCount(5);
    } else {
      await expect(page.getByTestId('expense-history')).toBeVisible();
      const columns = await page.locator('.review-scroll').evaluateAll(els => els.map(el => ({ top: el.getBoundingClientRect().top, left: el.getBoundingClientRect().left, height: el.clientHeight, scroll: getComputedStyle(el).overflowY })));
      expect(columns[1].left).toBeGreaterThan(columns[0].left);
      expect(Math.abs(columns[1].top - columns[0].top)).toBeLessThan(5);
      expect(columns.every(column => column.scroll === 'auto')).toBe(true);
    }
    await details.getByTestId('match-expense').first().click();
    await expect(details.getByTestId('unmatch-expense')).toBeEnabled();
    await expect(details).toContainText('Continente groceries');
    expect(writes).toEqual(['match']);
    await page.screenshot({ path: `test-results/matching-${viewport.name}-linked.png`, fullPage: true });
    await details.getByTestId('unmatch-expense').click();
    await expect(details.getByTestId('match-expense')).toHaveCount(3);
    expect(writes).toEqual(['match', 'unmatch']);
    await page.locator('[data-tx-id="7"]').getByTestId('bank-row-toggle').click();
    await expect(details).toContainText('No suggested matches');
    await expect(details.getByTestId('bank-action')).toHaveText('Ignore');
    await page.screenshot({ path: `test-results/matching-${viewport.name}-empty.png`, fullPage: true });
  });
}

test('mobile: unknown Match response refreshes state without repeating writes, and permits only renewed intent', async ({ page }) => {
  await transport(page);
  await page.setViewportSize({ width: 402, height: 874 });
  let attempts = 0;
  let reads = 0;
  page.on('request', req => { if (req.method() === 'GET' && req.url().endsWith('/BankTransaction')) reads++; });
  await page.route(`**/BankTransaction/${ID}/match`, route => {
    attempts++;
    return route.fulfill({ status: 502, json: { title: 'Unknown result' } });
  });
  await page.goto('/bank');
  const row = page.locator(`[data-tx-id="${ID}"]`);
  await row.getByTestId('bank-row-toggle').click();
  await row.getByTestId('match-expense').first().click();
  await expect(row.getByTestId('bank-row-error')).toContainText('Could not confirm');
  await expect(row.getByTestId('match-expense').first()).toBeEnabled();
  expect(attempts).toBe(1);
  expect(reads).toBe(2);
  await expect(row.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('bank-filter').first()).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/matching-mobile-recovery.png', fullPage: true });
  await row.getByTestId('match-expense').first().click();
  await expect.poll(() => attempts).toBe(2);
  await expect(row.getByTestId('match-expense').first()).toBeEnabled();
});
