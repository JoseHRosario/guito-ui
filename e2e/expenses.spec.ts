import { expect, test } from '@playwright/test';

// e2e for the app shell + latest-expenses list (issue guito-api#40).
// Data is stubbed in-app; no live API wiring yet, so no network stubbing is needed.

test.describe('app shell + expense list (stubbed data)', () => {
  test('desktop: header nav, sidebar, summary bar and grouped list render', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1033 });
    await page.goto('/');

    await expect(page).toHaveTitle(/Guito/);

    // Header shell: logo, nav, sign-in
    await expect(page.getByRole('link', { name: 'Guito home' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const label of ['Dashboard', 'Expenses', 'Budgets', 'Settings']) {
      await expect(nav.getByText(label)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // Summary bar (token-formatted stub values)
    await expect(page.getByTestId('summary-expense').first()).toHaveText(/4853,72\s+€/);
    await expect(page.getByTestId('summary-income').first()).toHaveText(/8\.?700,00\s+€/);
    await expect(page.getByTestId('summary-total').first()).toHaveText(/3\.?846,28\s+€/);

    // Grouped list mirrors the approved frames
    const headers = page.locator('[data-testid="group-header"]:visible');
    await expect(headers).toHaveText(['Jan 03, Sunday', 'Jan 02, Saturday']);
    await expect(page.locator('[data-testid="expense-row"]:visible')).toHaveCount(7);
    const firstRow = page.locator('[data-testid="expense-row"]:visible').first();
    await expect(firstRow).toContainText('H&M');
    await expect(firstRow).toContainText('-65,55 €');

    // Footer + sidebar (desktop-only regions)
    await expect(page.getByText('Guito · Personal Expense Tracker')).toBeVisible();
    await expect(page.getByTestId('sidebar-wallet').first()).toHaveText(/\+12[ .\u00a0\u202f]450,00\s+€/);
  });

  test('mobile: hamburger header, bottom nav, FAB and list render', async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    for (const label of ['Dashboard', 'Expenses', 'Budgets', 'Settings']) {
      await expect(bottomNav.getByText(label)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Add expense' })).toBeVisible();
    await expect(page.locator('[data-testid="expense-row"]:visible')).toHaveCount(7);

    // Desktop-only chrome stays hidden
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    await expect(page.locator('[data-testid="sidebar-wallet"]:visible')).toHaveCount(0);
  });
});
