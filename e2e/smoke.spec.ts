import { test, expect } from '@playwright/test';

// Minimal smoke e2e of the hello-world page (issue #7 acceptance criterion).
test.describe('hello-world smoke', () => {
  test('renders the styled page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Guito/);
    const heading = page.getByRole('heading', { name: 'Guito' });
    await expect(heading).toBeVisible();
    // The button must exist and carry daisyUI's primary style (token-driven theme)
    const button = page.getByRole('button', { name: 'Get started' });
    await expect(button).toBeVisible();
    await expect(button).toHaveClass(/btn-primary/);
    // The token-driven background color resolved (not transparent/unstyled)
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });
});
