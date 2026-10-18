import { expect, test, type Page } from '@playwright/test';
import { SESSION_KEY } from './helpers/stub-auth';

const original = { id: 7, amount: '-65.5500', description: 'Veggies and fruit', category: 'Groceries', bookingDate: '2026-07-02T14:23:45.123456+01:00', currency: 'EUR', revision: '1' };
const evidence = process.env['GUITO_ISSUE70_EVIDENCE_DIR'];
const field = (page: Page, name: string) => page.locator(`input[id$="-${name}"]:visible`);
const action = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true });

async function setup(page: Page) {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ idToken: 'stub', accessToken: 'stub', persistent: true, sessionExpiresAt: '2099-01-01T00:00:00Z', refreshedAt: Date.now(), expiresAt: Date.now() + 3600000 })), SESSION_KEY);
  // Every remote request is intercepted; no live API or financial mutations.
  await page.route('https://**', route => route.abort());
  await page.route('**/Category', route => route.fulfill({ json: { categories: [{ name: 'Groceries' }, { name: 'Restaurants' }] } }));
}

test.use({ timezoneId: 'America/Los_Angeles' });
for (const [name, viewport] of [['mobile', { width: 402, height: 874 }], ['desktop', { width: 1440, height: 1033 }]] as const) {
  test(`${name}: keyboard list entry, exact update, reused list refresh and delete`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    let resource: typeof original | null = { ...original };
    let lists = 0; let writes = 0;
    await page.route('**/Expense/latest/20', route => { lists++; return route.fulfill({ json: { expenses: resource ? [resource, { ...original, id: null, description: 'Legacy' }] : [] } }); });
    await page.route('**/Expense/7', async route => {
      const req = route.request();
      if (req.method() === 'GET') { await route.fulfill({ json: resource, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: `"${resource?.revision}"` } }); return; }
      expect(req.headers()['if-match']).toBe(`"${resource!.revision}"`);
      writes++;
      if (req.method() === 'PUT') {
        const body = req.postDataJSON();
        expect(body).toEqual({ amount: '-65.5500', description: '', category: 'Groceries', bookingDate: original.bookingDate, currency: 'EUR' });
        resource = { ...resource!, ...body, revision: '2' };
        await route.fulfill({ json: resource, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"2"' } });
      } else {
        expect(req.method()).toBe('DELETE'); resource = null;
        await route.fulfill({ status: 204 });
      }
    });
    await page.goto('/');
    const legacy = page.locator('[data-testid="expense-row"]:visible').filter({ hasText: 'Legacy' });
    await expect(legacy).not.toHaveAttribute('href');
    const row = page.locator('[data-expense-id="7"]:visible');
    await row.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/expenses\/7\/edit$/);
    await expect(field(page, 'amount')).toHaveValue('-65,5500');
    await expect(field(page, 'time')).toHaveValue('14:23');
    const amount = (await field(page, 'amount').boundingBox())!;
    const date = (await field(page, 'date').boundingBox())!;
    const time = (await field(page, 'time').boundingBox())!;
    const description = (await field(page, 'description').boundingBox())!;
    expect(date.y).toBe(time.y);
    if (name === 'desktop') { expect(amount.y).toBe(date.y); expect(description.y).toBeGreaterThan(date.y); }
    else { expect(description.y).toBeGreaterThan(amount.y); expect(date.y).toBeGreaterThan(description.y); }
    expect(await page.locator('body').evaluate(body => body.scrollWidth <= innerWidth)).toBe(true);
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-edit.png`, fullPage: true });
    await field(page, 'description').fill('');
    await action(page, 'Save changes').click();
    await expect(page.getByRole('status')).toContainText('Expense updated');
    await expect.poll(() => lists).toBeGreaterThan(1);
    await page.locator('[data-expense-id="7"]:visible').click();
    await action(page, 'Delete expense').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('-65.5500');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Delete expense' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-delete-confirm.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(action(page, 'Delete expense')).toBeFocused();
    await action(page, 'Delete expense').click();
    await dialog.getByRole('button', { name: 'Delete expense' }).click();
    await expect(page.getByRole('status')).toContainText('Expense deleted');
    await expect(page.locator('[data-expense-id="7"]:visible')).toHaveCount(0);
    expect(writes).toBe(2);
  });

  test(`${name}: native Time keyboard editing, exact retention, date-only precision and reverted fields`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    const bodies: { bookingDate: string; description: string; amount: string; category: string }[] = [];
    await page.route('**/Expense/7', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: original, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"1"' } });
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: {} });
    });
    await page.goto('/expenses/7/edit');
    const time = field(page, 'time');
    await expect(time).toHaveAttribute('type', 'time');
    await expect(time).toHaveAttribute('step', '60');
    await expect(time).toHaveValue('14:23');
    async function save(expected: string) {
      const count = bodies.length;
      await action(page, 'Save changes').click();
      await expect.poll(() => bodies.length).toBe(count + 1);
      await expect(page.locator('[role="alert"]:visible')).toContainText('Request rejected');
      expect(bodies[count].bookingDate).toBe(expected);
    }
    await save(original.bookingDate); // Open → unchanged save keeps the exact wire string.
    await field(page, 'description').fill('Precision retained');
    await field(page, 'amount').fill('-12,3456');
    await page.locator('select[id$="-category"]:visible').selectOption('Restaurants');
    await save(original.bookingDate);
    expect(bodies[1]).toMatchObject({ amount: '-12.3456', description: 'Precision retained', category: 'Restaurants' });
    await field(page, 'date').fill('2026-01-03');
    await expect(page.locator('g-edit-expense-page')).not.toContainText('Original precision retained');
    await save('2026-01-03T14:23:45.123456+00:00');
    await time.fill('16:24');
    await save('2026-01-03T16:24:00+00:00');
    await time.focus(); await page.keyboard.press('ArrowUp');
    await expect(time).not.toHaveValue('16:24');
    expect(await time.evaluate((node: HTMLInputElement) => node.validity.valid)).toBe(true);
    await time.fill('14:23'); await field(page, 'date').fill('2026-07-02');
    await expect(page.locator('g-edit-expense-page')).toContainText('Original precision retained');
    await save(original.bookingDate);
    await time.fill(''); await action(page, 'Save changes').click();
    await expect(page.locator('g-edit-expense-page')).toContainText('Enter a valid time');
    expect(bodies.length).toBe(5);
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-native-time-validation.png`, fullPage: true });
  });

  test(`${name}: minute reversion restores nonzero-second fold and leaves without dirty prompt`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    const fold = { ...original, bookingDate: '2026-10-25T01:30:42.654321+00:00' };
    let writes = 0;
    await page.route('**/Expense/latest/20', route => route.fulfill({ json: { expenses: [fold] } }));
    await page.route('**/Expense/7', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: fold, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"1"' } });
      writes++;
      expect(route.request().postDataJSON().bookingDate).toBe(fold.bookingDate);
      return route.fulfill({ status: 409, json: {} });
    });
    await page.goto('/'); await page.locator('[data-expense-id="7"]:visible').click();
    await expect(field(page, 'time')).toHaveValue('01:30');
    await field(page, 'date').fill('2026-10-26'); await field(page, 'time').fill('02:30');
    await field(page, 'date').fill('2026-10-25'); await field(page, 'time').fill('01:30');
    await action(page, 'Save changes').click();
    await expect.poll(() => writes).toBe(1);
    await expect(page.locator('[role="alert"]:visible')).toContainText('Request rejected');
    await action(page, 'Cancel').click(); await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`${name}: direct reload, dirty back guard, stale reload confirmation and retained values`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    let reads = 0; let writes = 0;
    await page.route('**/Expense/latest/20', route => route.fulfill({ json: { expenses: [original] } }));
    await page.route('**/Expense/7', route => {
      if (route.request().method() === 'GET') { reads++; return route.fulfill({ json: { ...original, revision: reads > 2 ? '2' : '1' }, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: reads > 2 ? '"2"' : '"1"' } }); }
      writes++; return route.fulfill({ status: 412, json: {} });
    });
    await page.goto('/'); await page.locator('[data-expense-id="7"]:visible').click();
    await expect(field(page, 'description')).toHaveValue(original.description);
    await page.reload(); await expect(field(page, 'description')).toHaveValue(original.description); expect(reads).toBe(2);
    await field(page, 'description').fill('My retained edit');
    await page.goBack();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Discard changes?');
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(field(page, 'description')).toHaveValue('My retained edit');
    await action(page, 'Save changes').click();
    await expect(page.locator('[role="alert"]:visible')).toContainText('Expense changed');
    await expect(action(page, 'Save changes')).toBeDisabled();
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-stale.png`, fullPage: true });
    await action(page, 'Reload expense').click();
    await expect(dialog).toContainText('discards your unsaved edits');
    await dialog.getByRole('button', { name: 'Reload expense', exact: true }).click();
    await expect(field(page, 'description')).toHaveValue(original.description);
    await expect(action(page, 'Save changes')).toBeEnabled(); expect(writes).toBe(1); expect(reads).toBe(3);
    await action(page, 'Cancel').click(); await expect(page).toHaveURL(/\/$/);
  });

  test(`${name}: uncertain write, failed GET check, GET-only retry and current absence`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    let reads = 0; let writes = 0;
    await page.route('**/Expense/7', route => {
      if (route.request().method() !== 'GET') { writes++; return route.abort('failed'); }
      reads++;
      if (reads === 1) return route.fulfill({ json: original, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"1"' } });
      return route.fulfill({ status: reads === 2 ? 503 : 404, json: {} });
    });
    await page.goto('/expenses/7/edit'); await field(page, 'description').fill('Retained intent');
    await action(page, 'Save changes').click();
    await expect(page.locator('[role="alert"]:visible')).toContainText('Could not check outcome');
    await expect(action(page, 'Save changes')).toBeDisabled(); await expect(action(page, 'Delete expense')).toBeDisabled();
    await expect(field(page, 'description')).toHaveValue('Retained intent');
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-check-failed.png`, fullPage: true });
    await action(page, 'Check again').click();
    await expect(page.locator('[role="alert"]:visible')).toContainText('does not confirm who deleted it');
    await expect(page).toHaveURL(/\/expenses\/7\/edit$/);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(writes).toBe(1); expect(reads).toBe(3);
    await action(page, 'Back to expenses').click();
    const discard = page.getByRole('dialog');
    await expect(discard).toContainText('previous write outcome is not confirmed');
    await expect(discard).not.toContainText('Your saved expense is unchanged');
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-absent-discard.png`, fullPage: true });
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(field(page, 'description')).toHaveValue('Retained intent');
    expect(writes).toBe(1); expect(reads).toBe(3);
  });
  test(`${name}: Lisbon validation and definite rejection retain values`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    let writes = 0;
    await page.route('**/Expense/7', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: original, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"1"' } });
      writes++; return route.fulfill({ status: 409, json: {} });
    });
    await page.goto('/expenses/7/edit');
    await field(page, 'amount').fill('1,2,3'); await field(page, 'date').fill('2026-03-29'); await field(page, 'time').fill('01:30');
    await action(page, 'Save changes').click();
    await expect(field(page, 'amount')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'time')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('g-edit-expense-page')).toContainText('does not exist in Lisbon'); expect(writes).toBe(0);
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-validation.png`, fullPage: true });
    await field(page, 'amount').fill('0'); await field(page, 'date').fill('2026-10-25'); await field(page, 'time').fill('01:30');
    await action(page, 'Save changes').click();
    await expect(page.locator('g-edit-expense-page')).toContainText('occurs twice in Lisbon'); expect(writes).toBe(0);
    await field(page, 'date').fill('2026-07-03'); await field(page, 'time').fill('14:23');
    await action(page, 'Save changes').click();
    await expect(page.locator('[role="alert"]:visible')).toContainText('Request rejected');
    await expect(field(page, 'amount')).toHaveValue('0'); await expect(field(page, 'time')).toHaveValue('14:23');
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-rejected.png`, fullPage: true });
    expect(writes).toBe(1);
  });

  for (const [changeName, change] of [
    ['category-only', { category: 'Restaurants' }],
    ['time-only', { bookingDate: '2026-07-02T14:23:45.654321+01:00' }],
  ] as const) {
    test(`${name}: ${changeName} current resource is complete and separate from retained intent`, async ({ page }) => {
      await page.setViewportSize(viewport); await setup(page);
      let reads = 0; let writes = 0;
      const current = { ...original, ...change, revision: '9223372036854775807' };
      await page.route('**/Expense/7', route => {
        if (route.request().method() !== 'GET') { writes++; return route.fulfill({ status: 503, json: {} }); }
        reads++;
        return route.fulfill({ json: reads === 1 ? original : current, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: reads === 1 ? '"1"' : '"9223372036854775807"' } });
      });
      await page.goto('/expenses/7/edit'); await field(page, 'description').fill('My retained intent');
      await action(page, 'Save changes').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('does not prove your operation succeeded');
      async function expectCurrent() {
        const summary = page.getByRole('region', { name: 'Current expense', exact: true }).filter({ visible: true });
        await expect(summary).toContainText(`Description: ${original.description}`);
        await expect(summary).toContainText('Amount: -65.5500 €');
        await expect(summary).toContainText(`Category: ${current.category}`);
        await expect(summary).toContainText(`Booking date: ${current.bookingDate}`);
        await expect(summary).toContainText('Revision: 9223372036854775807');
        await expect(summary).not.toContainText('My retained intent');
        expect(await summary.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await expectCurrent();
      expect(await dialog.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
      if (evidence) await page.screenshot({ path: `${evidence}/${name}-${changeName}-recovery.png`, fullPage: true });
      await dialog.getByRole('button', { name: 'Keep editing' }).click();
      await expectCurrent();
      await expect(field(page, 'description')).toHaveValue('My retained intent');
      await expect(field(page, 'time')).toHaveValue('14:23');
      await expect(page.locator('select[id$="-category"]:visible')).toHaveValue('Groceries');
      await expect(action(page, 'Save changes')).toBeDisabled();
      expect(await page.locator('body').evaluate(body => body.scrollWidth <= innerWidth)).toBe(true);
      if (evidence) await page.screenshot({ path: `${evidence}/${name}-${changeName}-retained.png`, fullPage: true });
      expect(writes).toBe(1); expect(reads).toBe(2);
    });
  }

  test(`${name}: uncertain matching readback is not success; explicit reload starts fresh intent`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    let reads = 0; let writes = 0; let intent = { ...original, amount: '-0.0000', bookingDate: '2026-10-25T01:30:42.123456+00:00' };
    await page.route('**/Expense/latest/20', route => route.fulfill({ json: { expenses: [intent] } }));
    await page.route('**/Expense/7', route => {
      const req = route.request();
      if (req.method() === 'GET') {
        reads++; return route.fulfill({ json: { ...intent, revision: reads === 1 ? '1' : '2' }, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: reads === 1 ? '"1"' : '"2"' } });
      }
      writes++;
      if (writes === 1) {
        expect(req.headers()['if-match']).toBe('"1"');
        expect(req.postDataJSON().amount).toBe('-0.0000'); expect(req.postDataJSON().bookingDate).toBe('2026-10-25T01:30:42.123456+00:00');
        intent = { ...intent, ...req.postDataJSON() };
        return route.fulfill({ status: 500, json: {} });
      }
      expect(req.headers()['if-match']).toBe('"2"'); return route.fulfill({ json: { ...intent, revision: '3' } });
    });
    await page.goto('/expenses/7/edit'); await field(page, 'description').fill('Matching readback');
    await action(page, 'Save changes').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('does not prove your operation succeeded');
    await expect(dialog).toContainText('Matching readback');
    await expect(action(page, 'Save changes')).toBeDisabled();
    expect(writes).toBe(1);
    if (evidence) await page.screenshot({ path: `${evidence}/${name}-current-found.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Reload expense', exact: true }).click();
    await expect(dialog).toContainText('discards your unsaved edits');
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Reload expense', exact: true }).click();
    await expect(action(page, 'Save changes')).toBeEnabled();
    await action(page, 'Save changes').click();
    await expect(page.getByRole('status')).toContainText('Expense updated'); expect(writes).toBe(2); expect(reads).toBe(3);
  });

}

test('preserves list scroll after acknowledged update of a route-reused list', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 }); await setup(page);
  let resource = { ...original, id: 17 };
  await page.route('**/Expense/latest/20', route => route.fulfill({ json: { expenses: Array.from({ length: 20 }, (_, i) => ({ ...resource, id: i + 1 })) } }));
  await page.route('**/Expense/17', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: resource, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: '"1"' } });
    resource = { ...resource, ...route.request().postDataJSON() }; return route.fulfill({ json: resource });
  });
  await page.goto('/'); await page.locator('[data-expense-id="17"]:visible').scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY); expect(before).toBeGreaterThan(100);
  await page.locator('[data-expense-id="17"]:visible').click(); await field(page, 'description').fill('Scroll updated');
  await action(page, 'Save changes').click(); await expect(page.getByRole('status')).toContainText('Expense updated');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
});

test('initial failed read retries GET, missing or invalid identity cannot write', async ({ page }) => {
  await setup(page); let reads = 0;
  await page.route('**/Expense/7', route => { reads++; expect(route.request().method()).toBe('GET'); return route.fulfill({ status: reads === 1 ? 503 : 404, json: {} }); });
  await page.goto('/expenses/7/edit'); await expect(action(page, 'Try reading again')).toBeVisible();
  await action(page, 'Try reading again').click(); await expect(page.getByRole('dialog')).toContainText('Expense unavailable');
  expect(reads).toBe(2); await expect(action(page, 'Save changes')).toHaveCount(0);
  await page.goto('/expenses/2147483648/edit'); await expect(page.locator('g-edit-expense-page')).toContainText('Invalid expense ID');
  await expect(action(page, 'Save changes')).toHaveCount(0); expect(reads).toBe(2);
});

test('write deadline checks exact ID, blocks departures while checking and never retries the write', async ({ page }) => {
  await setup(page); await page.clock.install();
  let writes = 0; let reads = 0;
  let releaseCheck!: () => void;
  const checkGate = new Promise<void>(resolve => { releaseCheck = resolve; });
  await page.route('**/Expense/7', async route => {
    if (route.request().method() !== 'GET') { writes++; return; } // transport never acknowledges the write
    reads++;
    if (reads > 1) await checkGate;
    await route.fulfill({ json: { ...original, revision: reads > 1 ? '2' : '1' }, headers: { 'Access-Control-Expose-Headers': 'ETag', ETag: reads > 1 ? '"2"' : '"1"' } });
  });
  await page.goto('/expenses/7/edit'); await field(page, 'description').fill('Timed out intent');
  await action(page, 'Save changes').click(); await expect.poll(() => writes).toBe(1);
  await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/expenses\/7\/edit$/);
  await page.clock.fastForward(15001);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Checking current expense');
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  if (evidence) await page.screenshot({ path: `${evidence}/desktop-checking.png`, fullPage: true });
  releaseCheck();
  await expect(dialog).toContainText('does not prove your operation succeeded');
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  expect(writes).toBe(1); expect(reads).toBe(2);
});
