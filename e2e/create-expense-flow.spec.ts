import { expect, test, type Page, type Route } from '@playwright/test';

import { stubExpensesApi, SESSION_KEY } from './helpers/stub-auth';

// e2e for the Create Expense flow (issue #32): FAB on the list →
// /expenses/create → save → back to the list with the new row on top +
// "Expense saved" toast. The API is stubbed at the transport level; the
// create POST mutates the stubbed list so the reload genuinely shows the new
// row. The UI posts the amount NEGATIVE (outflow — the API stores Amount
// verbatim and the list renders it verbatim).

// Both responsive branches exist in the DOM; scope everything to the visible one.
const vis = (testId: string): string => `[data-testid="${testId}"]:visible`;

const SEED_EXPENSES = {
  expenses: [
    { storedOrder: 1, date: '2021-01-03T10:12:00', amount: -65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'e2e@guito.app' },
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
async function stubExpenseApis(page: Page): Promise<{ expenses: typeof SEED_EXPENSES.expenses }> {
  const state = { expenses: [...SEED_EXPENSES.expenses] };
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
    await expect(firstRow).toContainText('-65,55 €');

    // Toast auto-dismisses ~3s and the saved param is cleared.
    await expect(page.locator(vis('saved-toast'))).toBeHidden({ timeout: 5000 });
    await expect(page).toHaveURL(/\/$/);
  });
});
