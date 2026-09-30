import { defineConfig, devices } from '@playwright/test';

// Deployed smoke (e2e/deployed-smoke.spec.ts) re-points baseURL at the live
// CloudFront URL when SMOKE_URL is set — only the deploy workflow's smoke job
// does this. Without SMOKE_URL (PR CI + local runs) everything targets the
// locally built dist, and the webServer boots it.

const smokeUrl = process.env.SMOKE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: smokeUrl ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // When SMOKE_URL is set, run ONLY the deployed smoke — a local spec against
  // the live site would be confusing at best; make that impossible instead.
  ...(smokeUrl
    ? { testMatch: /deployed-smoke\.spec\.ts/ }
    : {
        webServer: {
          // http-server has no SPA fallback; tools/dev/spa-server.mjs serves index.html
          // for unknown paths so deep links (/signin, /auth/callback) resolve.
          command: 'node tools/dev/spa-server.mjs dist/guito-ui/browser 8081',
          url: 'http://localhost:8081',
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }),
});
