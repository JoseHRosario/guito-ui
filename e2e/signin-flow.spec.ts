import { test } from '@playwright/test';

import { stubbedSignInFlow } from './helpers/stub-auth';

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
});
