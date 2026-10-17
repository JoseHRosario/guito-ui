import { expect, test, type Page } from '@playwright/test';
import { SESSION_KEY } from './helpers/stub-auth';

const ID = '9223372036854775807';
const ENDPOINT = `/BankTransaction/${ID}/create-and-match`;
const operationReceipt = (operationId: string) => `{"operationId":"${operationId}","transactionId":${ID},"expenseId":123}`;
async function setup(page: Page, mode: 'success' | 'unknown' = 'success', suggestions = 0, manyRows = false) {
  const posts: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let matched = false;
  let receiptAvailable = false;
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'test-id', accessToken: 'test-access', expiresAt: Date.now() + 3600000 })), SESSION_KEY);
  await page.route('**/Expense**', route => route.fulfill({ status: 501, body: 'Unexpected Expense request' }));
  await page.route('**/BankTransaction**', route => route.fulfill({ status: 501, body: 'Unexpected Bank request' }));
  await page.route('**/Category', route => route.fulfill({ json: { categories: [{ name: 'Shopping' }, { name: 'Travel' }] } }));
  await page.route('**/Expense/history?*', route => route.fulfill({ json: { pageSize: 100, pageIndex: 0, totalCount: 0, hasMore: false, expenses: [] } }));
  await page.route('**/BankTransaction', route => {
    const tx = `{"id":${ID},"bookingDate":"2026-10-02","amount":"58.937","currency":"EUR","remittanceInformation":"Bank purchase","reviewStatus":"${matched ? 'matched' : 'needsReview'}","suggestedExpenseCount":${suggestions},"suggestedCategory":{"id":3,"name":"Shopping"},"linkedExpense":${matched ? '{"id":123,"bookingDate":"2026-10-03T12:00:00+01:00","amount":"1.234","currency":"EUR","description":"Edited purchase","category":"Travel"}' : 'null'}}`;
    return route.fulfill({ contentType: 'application/json', body: `[${manyRows ? Array.from({ length: 25 }, (_, i) => JSON.stringify({ id: i + 1, bookingDate: '2026-10-03', amount: '5', currency: 'EUR', remittanceInformation: `Other purchase ${i}`, reviewStatus: 'needsReview', suggestedExpenseCount: 0 })).join(',') + ',' : ''}${tx}]` });
  });
  await page.route('**/BankTransaction/*/suggestions', route => route.fulfill({ json: suggestions ? [{ id: 20, description: 'Existing candidate', bookingDate: '2026-10-02T12:00:00+01:00', amount: '58.937', currency: 'EUR', category: 'Shopping' }] : [] }));
  await page.route(`**${ENDPOINT}`, route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    if (mode === 'unknown' && posts.length === 1) return route.fulfill({ status: 502, body: 'Lost acknowledgement' });
    matched = true;
    return route.fulfill({ contentType: 'application/json', body: operationReceipt(String(body['operationId'])) });
  });
  await page.route(`**${ENDPOINT}/*`, route => {
    reads.push(route.request().url());
    if (receiptAvailable) return route.fulfill({ contentType: 'application/json', body: operationReceipt(String(posts[0]['operationId'])) });
    return route.fulfill({ status: 404, body: '' });
  });
  return { posts, reads, historicalReceipt() { receiptAvailable = true; matched = false; } };
}
async function openCreate(page: Page) {
  await page.goto('/bank');
  await page.getByTestId('bank-filter').filter({ hasText: 'Needs review' }).click();
  await page.getByTestId('bank-row-toggle').click();
  await page.getByTestId('create-bank-expense').click();
  await expect(page).toHaveURL(new RegExp(`/expenses/create\\?bankTransactionId=${ID}`));
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toHaveValue('58,937');
}
for (const viewport of [{ name: 'mobile', width: 402, height: 874 }, { name: 'desktop', width: 1440, height: 1033 }]) {
  test(`${viewport.name}: existing Create form accepts independent edits and atomically returns to retained Bank filter`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const transport = await setup(page, 'success', viewport.name === 'mobile' ? 0 : 1);
    await openCreate(page);
    await page.getByTestId('amount-input').filter({ visible: true }).fill('1,234');
    await page.getByTestId('description-input').filter({ visible: true }).fill('Edited purchase');
    await page.getByTestId('date-input').filter({ visible: true }).fill('2026-10-03');
    await page.locator('select:visible').selectOption('Travel');
    await page.getByTestId('save-expense').filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/bank$/);
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]).toMatchObject({ amount: '1.234', description: 'Edited purchase', category: 'Travel', currency: 'EUR', bookingDate: expect.stringMatching(/^2026-10-03T/) });
    expect(transport.posts[0]['operationId']).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByTestId('bank-filter').filter({ hasText: 'Needs review' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('bank-row')).toHaveCount(0);
    await expect(page.getByText('No transactions in this filter.')).toBeVisible();
    await page.getByTestId('bank-filter').filter({ hasText: /^All$/ }).click();
    await page.getByTestId('bank-row-toggle').click();
    await expect(page.getByTestId('bank-details')).toContainText('Edited purchase');
    await page.screenshot({ path: `test-results/create-match-${viewport.name}.png`, fullPage: true });
  });
}

test('Cancel and browser Back write nothing; query route reload retains exact prefill', async ({ page }) => {
  const transport = await setup(page);
  await openCreate(page);
  await page.reload();
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toHaveValue('58,937');
  await page.getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/bank$/);
  await expect(page.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('create-bank-expense').click();
  await page.goBack();
  await expect(page).toHaveURL(/\/bank$/);
  expect(transport.posts).toHaveLength(0);
});

test('unknown response freezes one intent; deliberate retry checks GET first and repeats the exact body', async ({ page }) => {
  const transport = await setup(page, 'unknown');
  await openCreate(page);
  await page.getByTestId('save-expense').filter({ visible: true }).click();
  await expect(page.getByTestId('save-error').filter({ visible: true })).toContainText('Outcome unknown');
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true })).toBeDisabled();
  expect(transport.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Check again', exact: true }).filter({ visible: true }).click();
  await expect.poll(() => transport.reads.length).toBe(2);
  expect(transport.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same operation', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/bank$/);
  expect(transport.reads).toHaveLength(3);
  expect(transport.posts).toHaveLength(2);
  expect(transport.posts[1]).toEqual(transport.posts[0]);
});

test('reload recovers a historical receipt after Unmatch without another POST or relink', async ({ page }) => {
  const transport = await setup(page, 'unknown');
  await openCreate(page);
  await page.getByTestId('save-expense').filter({ visible: true }).click();
  await expect(page.getByTestId('save-error').filter({ visible: true })).toContainText('Outcome unknown');
  transport.historicalReceipt();
  // A real browser prompts before leaving an uncertain write; accepting reload is deliberate.
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page).toHaveURL(/\/bank$/);
  await expect(page.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('bank-row')).toContainText('Needs review');
  expect(transport.posts).toHaveLength(1);
  expect(transport.reads).toHaveLength(2);
});

test('unknown reload keeps edited frozen values and cannot start a fresh operation', async ({ page }) => {
  const transport = await setup(page, 'unknown');
  await openCreate(page);
  await page.getByTestId('amount-input').filter({ visible: true }).fill('-123,456');
  await page.getByTestId('description-input').filter({ visible: true }).fill('Frozen edit');
  await page.getByTestId('save-expense').filter({ visible: true }).click();
  await expect(page.getByTestId('save-error').filter({ visible: true })).toContainText('Outcome unknown');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toHaveValue('-123,456');
  await expect(page.getByTestId('description-input').filter({ visible: true })).toHaveValue('Frozen edit');
  await expect(page.getByTestId('save-expense').filter({ visible: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Bank', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`bankTransactionId=${ID}`));
  expect(transport.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same operation', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/bank$/);
  expect(transport.posts[1]).toEqual(transport.posts[0]);
});

test('Bank scroll, expansion and mobile view survive Cancel through the existing form', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 600 });
  await setup(page, 'success', 0, true);
  await page.route('**/Expense/history?*', route => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    return route.fulfill({ json: { pageSize: 100, pageIndex: index, totalCount: 50, hasMore: index === 0,
      expenses: Array.from({ length: 25 }, (_, i) => ({ id: index * 25 + i + 1, amount: '5', currency: 'EUR', category: 'Shopping', description: `History ${index * 25 + i}`, bookingDate: '2026-10-03T12:00:00+01:00' })) } });
  });
  await page.goto('/bank');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Load older Expenses' }).click();
  await expect(page.locator('[data-history-id="50"]')).toBeAttached();
  const historyScroll = page.getByRole('region', { name: 'Expense history list', exact: true });
  await historyScroll.evaluate(el => { el.scrollTop = 3000; });
  const historyBefore = await historyScroll.evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  const row = page.locator(`[data-tx-id="${ID}"]`);
  await row.getByTestId('bank-row-toggle').click();
  await row.getByTestId('create-bank-expense').scrollIntoViewIfNeeded();
  const scroll = page.getByRole('region', { name: 'Bank Transaction list', exact: true });
  const before = await scroll.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(100);
  await row.getByTestId('create-bank-expense').click();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('guito.bank-return')!).transactionScroll)).toBe(before);
  await page.reload();
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/bank$/);
  await expect(row.getByTestId('bank-row-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Transactions', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBe(before);
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await expect(page.locator('[data-history-id="50"]')).toBeAttached();
  await expect.poll(() => historyScroll.evaluate(el => el.scrollTop)).toBe(historyBefore);
});

test('in-flight double Save sends one POST and blocks inputs, Cancel and routed departures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1033 });
  await setup(page);
  const posts: Record<string, unknown>[] = [];
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${ENDPOINT}`, async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    await gate;
    await route.fulfill({ contentType: 'application/json', body: operationReceipt(String(body['operationId'])) });
  });
  await openCreate(page);
  await page.getByTestId('save-expense').filter({ visible: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByTestId('amount-input').filter({ visible: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Bank', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`bankTransactionId=${ID}`));
  release();
  await expect(page).toHaveURL(/\/bank$/);
  expect(posts).toHaveLength(1);
});

test('unavailable session storage blocks Bank Create before any write or ordinary Expense route', async ({ page }) => {
  const transport = await setup(page);
  await page.goto('/bank');
  await page.getByTestId('bank-row-toggle').click();
  await page.evaluate(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } }));
  await page.getByTestId('create-bank-expense').click();
  await expect(page.getByTestId('bank-row-error')).toContainText('Create expense is blocked');
  await expect(page).toHaveURL(/\/bank$/);
  expect(transport.posts).toHaveLength(0);
});
