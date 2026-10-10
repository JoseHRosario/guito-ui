import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * Shared stubs for the sign-in flow e2e (guito-api#51 + deployed smoke):
 * no real Google round-trip — the authorize navigation is intercepted and
 * bounced back to /auth/callback with a fake code, and POST /Auth/token
 * returns stubbed tokens while asserting the exchange contract.
 */

export const E2E_AUTH_CODE = 'e2e-auth-code';

export const SESSION_KEY = 'guito.auth.session';

/** The latest-expenses list is LIVE (guito-api#9) — stub it at the transport. */
const STUB_API_EXPENSES = {
  expenses: [
    // Representative positive fixtures; signed and zero Expenses are also valid.
    { id: 'expense-1', occurredAt: '2021-01-03T10:12:00+00:00', currency: 'EUR', date: '2021-01-03T10:12:00', amount: 65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-2', occurredAt: '2021-01-03T11:30:00+00:00', currency: 'EUR', date: '2021-01-03T11:30:00', amount: 80.0, description: 'T-Mobile', category: 'Broadband', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-3', occurredAt: '2021-01-03T14:45:00+00:00', currency: 'EUR', date: '2021-01-03T14:45:00', amount: 120.0, description: 'Walmart', category: 'Shopping', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-4', occurredAt: '2021-01-03T18:20:00+00:00', currency: 'EUR', date: '2021-01-03T18:20:00', amount: 150.6, description: 'Con Edison', category: 'Bills', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-5', occurredAt: '2021-01-02T08:00:00+00:00', currency: 'EUR', date: '2021-01-02T08:00:00', amount: 30.15, description: 'Netflix', category: 'Entertainment', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-6', occurredAt: '2021-01-02T09:15:00+00:00', currency: 'EUR', date: '2021-01-02T09:15:00', amount: 55.0, description: 'Starbucks', category: 'Snacks', creatorEmail: 'e2e@guito.app' },
    { id: 'expense-7', occurredAt: '2021-01-02T17:40:00+00:00', currency: 'EUR', date: '2021-01-02T17:40:00', amount: 78.4, description: 'CVS Pharmacy', category: 'Health', creatorEmail: 'e2e@guito.app' },
  ],
};

export async function stubExpensesApi(page: Page | BrowserContext): Promise<void> {
  await page.route('**/Expense/latest/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUB_API_EXPENSES) }),
  );
}

export async function stubGoogleAuthorize(page: Page | BrowserContext, appOrigin: string): Promise<void> {
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

export async function stubTokenExchange(page: Page | BrowserContext): Promise<void> {
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
  await stubExpensesApi(page); // the Expenses list is live (guito-api#9) — stub the transport
  // The app prefers a POPUP sign-in (issue #36) and Playwright page routes do
  // not cover popup windows — block the popup so the flow exercises the
  // full-page redirect fallback, which IS routed by stubGoogleAuthorize.
  await page.evaluate(() => {
    (window as unknown as { open: unknown }).open = () => null;
  });
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
