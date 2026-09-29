import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // http-server has no SPA fallback; tools/dev/spa-server.mjs serves index.html
    // for unknown paths so deep links (/signin, /auth/callback) resolve.
    command: 'node tools/dev/spa-server.mjs dist/guito-ui/browser 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
