import { expect, test, type Page, type Route } from '@playwright/test';

import { stubExpensesApi } from './helpers/stub-auth';

// e2e for the voice capture path (issue #44, approved frames 3141:2 / 3141:180
// / 3134:10053): speech is faked at the Web Speech API seam (Chromium's real
// SpeechRecognition needs mic permissions), /AI/extract is stubbed at the HTTP
// transport — the endpoint itself is a 501 stub until guito-api#69 lands.

const SESSION_KEY = 'guito.auth.session';

const EXTRACT_OK = { date: '2026-10-02', occurredAt: '2026-10-02T14:00:17+05:30', amount: 123456789.12345679, amountExact: '123456789.123456789', description: 'Coco Verde', category: 'Eating out' };

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ idToken: 'e2e-id', accessToken: 'e2e-access', expiresAt: Date.now() + 3_600_000 }),
    );
  }, SESSION_KEY);
}

/**
 * Installs a SpeechRecognition fake that speaks a fixed transcript when the
 * app calls start() — the same lifecycle the real one uses (results, then
 * `onend` when the recording stops).
 */
async function installSpeechFake(page: Page, transcript: string): Promise<void> {
  await page.addInitScript((spoken) => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start(): void {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: spoken }]] });
          this.onend?.();
        }, 100);
      }
      stop(): void {}
      abort(): void {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  }, transcript);
}

async function stubExtract(page: Page, status = 200, body: unknown = EXTRACT_OK): Promise<void> {
  await page.route('**/AI/extract', (route: Route) => {
    void route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** The create form loads categories live (GET /Category) — stub at the transport. */
async function stubCategoryApi(page: Page): Promise<void> {
  await page.route('**/Category', (route: Route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ categories: [{ name: 'Clothing' }, { name: 'Eating out' }] }) });
  });
}

test.describe('voice capture (issue #44, stubbed speech + extract)', () => {
  test('voice → extract → create form prefilled with AI suggested markers', async ({ page }) => {
    await stubExpensesApi(page);
    await stubCategoryApi(page);
    await stubExtract(page);
    await seedSession(page);
    await installSpeechFake(page, 'café dois e trinta no Coco Verde');
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    // Open the dial: pills are Manual, Voice, Morning Coffee (top to bottom).
    await page.getByTestId('add-expense-fab').click();
    await expect(page.getByTestId('speed-dial-manual')).toBeVisible();
    await expect(page.getByTestId('speed-dial-voice')).toBeVisible();
    await expect(page.getByTestId('speed-dial-favorite-morning-coffee')).toBeVisible();

    // Listening feedback is unit-covered; don't race the fake's 100ms state.
    await page.getByTestId('speed-dial-voice').click();

    // Extract runs (spinner covered in the unit specs — the fake resolves in
    // ~100ms, too fast to catch the frame here): the app navigates to the form.
    await expect(page).toHaveURL(/\/expenses\/create$/, { timeout: 5_000 });

    // Prefilled for review (frame 3134:10053): pt-PT comma amount + markers.
    await expect(page.locator('[data-testid="amount-input"]:visible')).toHaveValue('123456789,123456789');
    await expect(page.locator('[data-testid="description-input"]:visible')).toHaveValue('Coco Verde');
    await expect(page.locator('[data-testid="date-input"]:visible')).toHaveValue('2026-10-02');
    const enabled = process.env['GUITO_TIMESTAMPS_ENABLED'] === 'true';
    if (enabled) await expect(page.locator('[data-testid="time-input"]:visible')).toHaveValue('09:30');
    else await expect(page.getByTestId('time-input')).toHaveCount(0);
    await page.route('**/Expense', async route => {
      expect(route.request().postDataJSON()).toEqual({ date: '2026-10-02', amount: '123456789.123456789', description: 'Coco Verde', category: 'Eating out', ...(enabled ? { occurredAt: EXTRACT_OK.occurredAt, currency: 'EUR' } : {}) });
      await route.fulfill({ json: { id: 'voice-opaque-id' } });
    });
    await expect(page.locator('[data-testid="category-select"]:visible')).toHaveValue('Eating out');
    for (const field of ['amount', 'date', 'description', 'category']) {
      await expect(page.getByTestId(`ai-suggested-${field}`).first()).toBeVisible();
    }
    if (process.env['GUITO_EVIDENCE_DIR']) {
      await page.locator('[data-testid=create-title]:visible').click();
      await page.screenshot({ path: `${process.env['GUITO_EVIDENCE_DIR']}/mobile-voice.png` });
    }
    await page.locator('[data-testid=save-expense]:visible').click();
    await expect(page).toHaveURL(/saved=1/);
  });

  test('extract failure → toast, staying on the list', async ({ page }) => {
    await stubExpensesApi(page);
    await stubCategoryApi(page);
    await stubExtract(page, 501, { message: 'stub' });
    await seedSession(page);
    await installSpeechFake(page, 'alguma coisa');
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto('/');

    await page.getByTestId('add-expense-fab').click();
    await page.getByTestId('speed-dial-voice').click();
    await expect(page.getByTestId('voice-toast')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('voice-toast')).toContainText("Couldn't understand");
    await expect(page).toHaveURL(/\/$/);
    await expect(page).not.toHaveURL(/expenses\/create/);
  });
});
