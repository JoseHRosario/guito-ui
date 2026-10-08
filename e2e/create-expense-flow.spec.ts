import { expect, test, type Page, type Route } from '@playwright/test';

import { stubExpensesApi, SESSION_KEY } from './helpers/stub-auth';

// e2e for the Create Expense flow (issue #32) + favorites speed-dial (issue
// #43): FAB on the list opens the speed-dial → Manual → /expenses/create →
// save → back to the list with the new row on top + "Expense saved" toast; a
// favorite tap creates the preset immediately. The API is stubbed at the
// transport level; the create POST mutates the stubbed list so the reload
// genuinely shows the new row. Amounts are posted POSITIVE (ADR 0010).

// Both responsive branches exist in the DOM; scope everything to the visible one.
const vis = (testId: string): string => `[data-testid="${testId}"]:visible`;

const SEED_EXPENSES = {
  expenses: [
    { storedOrder: 1, date: '2021-01-03T10:12:00', amount: 65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'e2e@guito.app' },
  ],
};

const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Food' }] };

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresAt: Date.now() + 3_600_000 }),
    );
  }, SESSION_KEY);
}

/** Serves the (mutable) latest list; the create handler prepends new expenses. */
async function stubExpenseApis(page: Page): Promise<{ expenses: typeof SEED_EXPENSES.expenses; created: Array<Record<string, unknown>> }> {
  const state = { expenses: [...SEED_EXPENSES.expenses], created: [] as Array<Record<string, unknown>> };
  await stubExpensesApi(page); // first-load stub from helpers (static seed)
  await page.route('**/Expense/latest/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expenses: state.expenses }) }),
  );
  await page.route('**/Category', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }),
  );
  await page.route('**/Expense', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 405, body: 'method not allowed' });
      return;
    }
    const body = route.request().postDataJSON() as { date: string; amount: number; description: string; category: string };
    state.created.push(body);
    state.expenses = [
      { storedOrder: 99, date: `${body.date}T12:00:00`, amount: body.amount, description: body.description, category: body.category, creatorEmail: 'e2e@guito.app' },
      ...state.expenses,
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 99 }) });
  });
  return state;
}

test.describe('create expense flow (stubbed API, signed in)', () => {
  test('validation errors keep the user on the form without calling POST', async ({ page }) => {
    await stubExpenseApis(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');
    await page.locator(vis('add-expense-fab')).click();
    await page.locator(vis('speed-dial-manual')).click();
    await expect(page).toHaveURL(/\/expenses\/create$/);
    await expect(page.locator(vis('create-title'))).toBeVisible();
    await expect(page.locator(vis('category-select'))).toHaveValue('Clothing');

    await page.locator(vis('save-expense')).click();
    await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/expenses\/create$/);
  });

  test('failed save shows the error card and keeps the entered values', async ({ page }) => {
    const state = await stubExpenseApis(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');
    await page.locator(vis('add-expense-fab')).click();
    await page.locator(vis('speed-dial-manual')).click();
    await expect(page).toHaveURL(/\/expenses\/create$/);

    await page.locator(vis('amount-input')).fill('65,55');
    await page.locator(vis('description-input')).fill('Veggies and fruit');
    await page.route('**/Expense', (route: Route) => route.fulfill({ status: 500, body: 'server error' }));
    await page.locator(vis('save-expense')).click();

    await expect(page.locator(vis('save-error'))).toContainText('Could not save the expense');
    await expect(page.locator(vis('amount-input'))).toHaveValue('65,55');
    await expect(page).toHaveURL(/\/expenses\/create$/);
    expect(state.expenses).toHaveLength(1);
  });

  test('successful save returns to the list: new row on top + toast that auto-dismisses', async ({ page }) => {
    await stubExpenseApis(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');
    await page.locator(vis('add-expense-fab')).click();
    await page.locator(vis('speed-dial-manual')).click();
    await expect(page).toHaveURL(/\/expenses\/create$/);

    await expect(page.locator(vis('category-select'))).toHaveValue('Clothing');
    await page.locator(vis('amount-input')).fill('65,55');
    await page.locator(vis('description-input')).fill('Veggies and fruit');
    await page.locator(vis('save-expense')).click();

    await expect(page).toHaveURL(/\/\?saved=1$/);
    await expect(page.locator(vis('saved-toast'))).toContainText('Expense saved');
    // The reloaded list shows the created expense as the newest row (stub prepends id 99).
    const firstRow = page.locator('[data-testid="expense-row"]:visible').first();
    await expect(firstRow).toContainText('Veggies and fruit');
    await expect(firstRow).toContainText('65,55 €');

    // Toast auto-dismisses ~3s and the saved param is cleared.
    await expect(page.locator(vis('saved-toast'))).toBeHidden({ timeout: 5000 });
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('favorites speed-dial (stubbed API, signed in)', () => {
  test('tapping the favorite creates the expense immediately with the preset payload', async ({ page }) => {
    const state = await stubExpenseApis(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    await page.locator(vis('add-expense-fab')).click();
    await expect(page.locator(vis('speed-dial-menu'))).toBeVisible();
    // Wait for the create POST to actually land before asserting on the
    // recorded payload — asserting synchronously after the click races the
    // request's first tick and flakes under CI load (PR #60's red run).
    const postCreated = page.waitForResponse(
      (r) => r.url().endsWith('/Expense') && r.request().method() === 'POST',
    );
    await page.locator(vis('speed-dial-favorite-morning-coffee')).click();
    await postCreated;

    // The preset posts as-is: positive amount, today's date, exact description/category.
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(state.created).toEqual([
      { date: iso, amount: 2.3, description: 'Coco Verde', category: 'Eating out' },
    ]);

    await expect(page).toHaveURL(/\/\?saved=1$/);
    await expect(page.locator(vis('saved-toast'))).toContainText('Expense saved');
    const firstRow = page.locator('[data-testid="expense-row"]:visible').first();
    await expect(firstRow).toContainText('Coco Verde');
    await expect(firstRow).toContainText('2,30 €');
  });

  test('the scrim closes the speed-dial without creating anything', async ({ page }) => {
    const state = await stubExpenseApis(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    await page.locator(vis('add-expense-fab')).click();
    await expect(page.locator(vis('speed-dial-menu'))).toBeVisible();
    await page.locator(vis('speed-dial-scrim')).click({ position: { x: 10, y: 10 } });

    await expect(page.locator(vis('speed-dial-menu'))).toBeHidden();
    expect(state.created).toHaveLength(0);
  });
});
