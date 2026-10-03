import { expect, test, type Page } from '@playwright/test';

import { stubExpensesApi } from './helpers/stub-auth';

// e2e for the app shell + latest-expenses list (guito-api#40, now LIVE per
// guito-api#9): the expense data comes from `GET /Expense/latest/20`, stubbed
// at the HTTP transport level. All routes sit behind the auth gate (ADR-0011):
// specs seed a valid session first.

const SESSION_KEY = 'guito.auth.session';

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresAt: Date.now() + 3_600_000 }),
    );
  }, SESSION_KEY);
}

test.describe('app shell + expense list (stubbed data, signed in)', () => {
  test('desktop: header nav, avatar, sidebar and grouped list render', async ({ page }) => {
    await stubExpensesApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 1440, height: 1033 });
    await page.goto('/');

    await expect(page).toHaveTitle(/Guito · Expenses/);

    // Header shell: logo, nav, signed-in avatar (sign-out menu is a future iteration)
    await expect(page.getByRole('link', { name: 'Guito home' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const label of ['Dashboard', 'Expenses', 'Budgets', 'Settings']) {
      await expect(nav.getByText(label)).toBeVisible();
    }
    await expect(page.getByTestId('header-avatar')).toBeVisible();

    // Issue #47: no summary bar on the Expenses page (returns on Dashboard later).
    await expect(page.getByTestId('summary-expense')).toHaveCount(0);

    // Grouped list mirrors the approved frames
    const headers = page.locator('[data-testid="group-header"]:visible');
    await expect(headers).toHaveText(['Jan 03, Sunday', 'Jan 02, Saturday']);
    await expect(page.locator('[data-testid="expense-row"]:visible')).toHaveCount(7);
    const firstRow = page.locator('[data-testid="expense-row"]:visible').first();
    await expect(firstRow).toContainText('H&M');
    await expect(firstRow).toContainText('65,55 €');

    // Footer + sidebar (desktop-only regions)
    await expect(page.getByText('Guito · Personal Expense Tracker')).toBeVisible();
    await expect(page.getByTestId('sidebar-wallet').first()).toHaveText(/\+12[ .\u00a0\u202f]450,00\s+€/);
  });

  test('bottom nav links to the blank sections (issue #47)', async ({ page }) => {
    await stubExpensesApi(page);
    await seedSession(page);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    await bottomNav.getByText('Budgets').click();
    await expect(page).toHaveURL(/\/budgets$/);
    await expect(page.getByTestId('page-title')).toHaveText('Budgets');

    await bottomNav.getByText('Settings').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('page-title')).toHaveText('Settings');

    await bottomNav.getByText('Expenses').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="expense-row"]:visible').first()).toBeVisible();
  });

  test('mobile: hamburger header, bottom nav, FAB and list render', async ({ page }) => {
    await stubExpensesApi(page);
    await seedSession(page);
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

test.describe('sign-in screen + auth gate (unauthenticated, guito-api#49)', () => {
  test('visiting / redirects to /signin?returnUrl=/ and renders the sign-in screen', async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    await expect(page).toHaveURL(/\/signin\?returnUrl=%2F$/);
    await expect(page.getByTestId('signin-logo')).toBeVisible();
    await expect(page.getByText('Personal expense tracker')).toBeVisible();
    await expect(page.getByTestId('signin-button')).toContainText('Sign in with Google');
    await expect(page.getByTestId('signin-legal')).toBeVisible();
  });

  test('deep links keep the original URL as returnUrl', async ({ page }) => {
    await page.goto('/?month=2');
    await expect(page).toHaveURL(/returnUrl=%2F%3Fmonth%3D2$/);
  });

  test('the sign-in screen renders standalone', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByTestId('signin-button')).toBeVisible();
  });
});
