import { expect, test } from '@playwright/test';

import { stubbedSignInFlow, stubExpensesApi, stubGoogleAuthorize, stubTokenExchange } from './helpers/stub-auth';

// e2e for the full sign-in flow against stubbed Google OAuth + stubbed token
// exchange (issue guito-api#51). Reuses the shared stub helpers; the deployed
// smoke spec (deployed-smoke.spec.ts) drives the same flow against the live
// CloudFront URL in CI.

test.describe('sign-in flow (stubbed Google OAuth + token exchange, guito-api#51)', () => {
  test('unauthenticated visit → /signin → stubbed sign-in → authenticated Expenses list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1033 });

    await page.goto('/');

    await stubbedSignInFlow(page);
  });

  // Issue #36: desktop uses the POPUP flow — the main window must never gain
  // a Google history entry. Context-level routes cover popup pages.
  test('popup sign-in: Google opens in a popup, main window never navigates, handoff completes sign-in', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1033 });

    await page.goto('/');
    await expect(page).toHaveURL(/\/signin\?returnUrl=%2F$/);

    const appOrigin = new URL(page.url()).origin;
    await stubGoogleAuthorize(page.context(), appOrigin); // context-level: covers the popup
    await stubTokenExchange(page); // the exchange runs in the MAIN window
    await stubExpensesApi(page);

    const popupPromise = page.context().waitForEvent('page');
    await page.getByTestId('signin-button').click();
    const popup = await popupPromise;

    // The popup lands on the app's /auth/callback (after the stubbed Google
    // bounce), posts the code to the opener and closes itself.
    await expect(popup).toHaveURL(new RegExp(`^${appOrigin}/auth/callback`), { timeout: 10_000 });
    await expect.poll(() => popup.isClosed(), { timeout: 10_000 }).toBe(true);

    // The MAIN window never navigated to Google: it is straight on the list.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('header-avatar')).toBeVisible();
    await expect(page.locator('[data-testid="expense-row"]:visible').first()).toBeVisible();

    const session = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
      'guito.auth.session',
    );
    expect(session).toMatchObject({ idToken: 'e2e-id', accessToken: 'e2e-access' });
  });
});
