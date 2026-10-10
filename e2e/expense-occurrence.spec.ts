import { expect, test } from '@playwright/test';
import { SESSION_KEY, stubExpensesApi } from './helpers/stub-auth';

// Browser/component seams agreed for #128. No real backend or Google requests.
test.use({ timezoneId: 'America/Los_Angeles' });
const visible = (id: string) => `[data-testid="${id}"]:visible`;

for (const [name, viewport, date, offset] of [
  ['mobile', { width: 402, height: 874 }, '2026-10-02', '+01:00'],
  ['desktop', { width: 1440, height: 1033 }, '2026-01-02', '+00:00'],
] as const) {
  test(`${name}: ${process.env['GUITO_TIMESTAMPS_ENABLED'] === 'true' ? 'timestamp capability, Lisbon/DST and exact save' : 'production legacy date-only exact save'}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-07-01T23:15:42Z'));
    await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'stub-id', accessToken: 'stub-access', expiresAt: Date.now() + 3600000 })), SESSION_KEY);
    await stubExpensesApi(page);
    await page.route('**/Category', route => route.fulfill({ json: { categories: [{ name: 'Clothing' }] } }));
    await page.goto('/expenses/create');
    await expect(page.locator(visible('date-input'))).toHaveValue('2026-07-02');
    if (process.env['GUITO_TIMESTAMPS_ENABLED'] !== 'true') {
      await expect(page.getByTestId('time-input')).toHaveCount(0);
      await expect(page.locator(visible('category-select'))).toHaveValue('Clothing');
      await page.locator(visible('amount-input')).fill('123456789,123456789');
      await page.locator(visible('description-input')).fill('Exact legacy');
      await page.locator(visible('date-input')).fill('2026-03-29');
      let body: unknown;
      await page.route('**/Expense', async route => {
        body = route.request().postDataJSON();
        // Simulates Sheets' real timestamp conflict: legacy mode must avoid it.
        await route.fulfill({ status: Object.hasOwn(body as object, 'occurredAt') ? 409 : 200, json: { id: 12 } });
      });
      await page.locator(visible('save-expense')).click();
      await expect(page).toHaveURL(/saved=1/);
      expect(body).toEqual({ date: '2026-03-29', amount: '123456789.123456789', description: 'Exact legacy', category: 'Clothing' });
      return;
    }
    await expect(page.locator(visible('time-input'))).toHaveValue('00:15');
    await expect(page.locator(visible('category-select'))).toHaveValue('Clothing');
    await page.locator(visible('amount-input')).fill('9007199254740993');
    await page.locator(visible('description-input')).fill('Veggies and fruit');
    await page.locator(visible('date-input')).fill('2026-03-29');
    await page.locator(visible('time-input')).fill('01:30');
    await page.locator(visible('save-expense')).click();
    await expect(page.locator('[data-testid=field-error]:visible')).toContainText('does not exist');
    await expect(page.locator(visible('time-input'))).toHaveAttribute('aria-invalid', 'true');
    if (process.env['GUITO_EVIDENCE_DIR']) await page.screenshot({ path: `${process.env['GUITO_EVIDENCE_DIR']}/${name}-dst-gap.png` });
    await page.locator(visible('date-input')).fill('2026-10-25');
    await page.locator(visible('save-expense')).click();
    await expect(page.locator('[data-testid=field-error]:visible')).toContainText('occurs twice');
    await page.locator(visible('date-input')).fill(date);
    await page.locator(visible('time-input')).fill('09:30');
    // A failed save keeps the values for retry and clears the DST error.
    await page.route('**/Expense', route => route.fulfill({ status: 500 }));
    await page.locator(visible('save-expense')).click();
    await expect(page.locator(visible('save-error'))).toContainText('Could not save');
    await expect(page.locator(visible('time-input'))).toHaveValue('09:30');
    if (process.env['GUITO_EVIDENCE_DIR']) await page.screenshot({ path: `${process.env['GUITO_EVIDENCE_DIR']}/${name}-save-failure.png` });
    // Reload to capture the canonical happy layout, then fill the same payload.
    await page.reload();
    await expect(page.locator(visible('category-select'))).toHaveValue('Clothing');
    await page.locator(visible('amount-input')).fill('9007199254740993');
    await page.locator(visible('description-input')).fill('Veggies and fruit');
    await page.locator(visible('date-input')).fill(date);
    await page.locator(visible('time-input')).fill('09:30');
    const dateBox = await page.locator(visible('date-input')).boundingBox();
    const timeBox = await page.locator(visible('time-input')).boundingBox();
    expect(dateBox?.y).toBe(timeBox?.y);
    expect(timeBox!.x).toBeGreaterThan(dateBox!.x);
    expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(visible('create-title')).click();
    if (process.env['GUITO_EVIDENCE_DIR']) await page.screenshot({ path: `${process.env['GUITO_EVIDENCE_DIR']}/${name}-create.png` });
    let posts = 0;
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/Expense', async route => {
      posts++;
      expect(route.request().postDataJSON()).toEqual({ date, occurredAt: `${date}T09:30:00${offset}`, currency: 'EUR', amount: '9007199254740993', description: 'Veggies and fruit', category: 'Clothing' });
      await hold;
      await route.fulfill({ json: { id: 'opaque/not-a-sheet-ordinal' } });
    });
    await page.locator(visible('save-expense')).click();
    await expect.poll(() => posts).toBe(1);
    await expect(page.locator(visible('save-expense'))).toBeDisabled();
    await expect(page.locator(visible('time-input'))).toBeDisabled();
    release();
    await expect(page).toHaveURL(/saved=1/);
    expect(posts).toBe(1);
  });
}
