import { test } from '@playwright/test';

import { stubbedSignInFlow } from './helpers/stub-auth';

// Deployed smoke (guito-api#51 "green on the deployed URL"): the SAME stubbed
// sign-in flow, but against the live CloudFront deployment. Google and the
// token exchange stay stubbed — what is real here is the deployed build
// (environment.prod baked in), the S3 assets, and the CloudFront SPA fallback
// for the /signin and /auth/callback deep links.
//
// Only runs when SMOKE_URL is set (the deploy workflow's smoke job sets it to
// the CloudFront URL); skips everywhere else so local/PR runs are unaffected.

const smokeUrl = process.env.SMOKE_URL;

test.describe('deployed smoke: stubbed sign-in flow against the live deployment', () => {
  test.skip(!smokeUrl, 'SMOKE_URL not set — deployed smoke runs only in the deploy workflow');

  test('deployed app: unauthenticated → /signin → stubbed sign-in → authenticated Expenses list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1033 });

    await page.goto('/');

    await stubbedSignInFlow(page);
  });
});
