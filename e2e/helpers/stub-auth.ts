import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Shared stubs for the sign-in flow e2e (guito-api#51 + deployed smoke):
 * no real Google round-trip — the authorize navigation is intercepted and
 * bounced back to /auth/callback with a fake code, and POST /Auth/token
 * returns stubbed tokens while asserting the exchange contract.
 */

export const E2E_AUTH_CODE = 'e2e-auth-code';

export const SESSION_KEY = 'guito.auth.session';

export async function stubGoogleAuthorize(page: Page, appOrigin: string): Promise<void> {
  await page.route('**/accounts.google.com/**', (route: Route) => {
    // Echo the state the app generated so the CSRF check passes end-to-end.
    const state = new URL(route.request().url()).searchParams.get('state') ?? '';
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      // Absolute URL: the fulfilled page's origin is accounts.google.com, so a
      // relative replace would resolve there, not against the app.
      body: `<script>location.replace('${appOrigin}/auth/callback?state=${encodeURIComponent(state)}&code=${E2E_AUTH_CODE}')</script>`,
    });
  });
}

interface TokenRequestBody {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function stubTokenExchange(page: Page): Promise<void> {
  await page.route('**/Auth/token', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fulfill({ status: 405, body: 'method not allowed' });
      return;
    }
    try {
      // Guard the exchange contract: the stubbed code + a real PKCE verifier
      // (RFC 7636: 43–128 chars) arrive, with the app's callback redirect_uri.
      const body = request.postDataJSON() as TokenRequestBody;
      expect(body.code).toBe(E2E_AUTH_CODE);
      expect(body.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(body.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(body.redirectUri).toContain('/auth/callback');
    } catch (cause) {
      // Non-JSON or contract-violating body — reject loudly with context.
      await route.fulfill({
        status: 400,
        contentType: 'text/plain',
        body: `stub rejected token exchange: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresIn: 3600 }),
    });
  });
}

/**
 * Drive the whole stubbed sign-in flow and assert the authenticated landing.
 * `startFrom` must already be on the app so the app origin can be captured.
 */
export async function stubbedSignInFlow(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/signin\?returnUrl=%2F$/);
  await expect(page.getByTestId('signin-button')).toBeVisible();

  // Start the (intercepted) Google round-trip.
  const appOrigin = new URL(page.url()).origin;
  await stubGoogleAuthorize(page, appOrigin);
  await stubTokenExchange(page);
  await page.getByTestId('signin-button').click();

  // Callback exchange lands the session and routes to the original target.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]:visible').first()).toBeVisible();

  // Session persisted: a reload stays authenticated on the same screen.
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('header-avatar')).toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]:visible').first()).toBeVisible();

  // The session was written by the exchange (not by an e2e seed).
  const session = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    SESSION_KEY,
  );
  expect(session).toMatchObject({ idToken: 'e2e-id', accessToken: 'e2e-access' });
}
