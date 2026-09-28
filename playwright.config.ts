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
    command: 'npx http-server dist/guito-ui/browser -p 8081 -c-1 --silent',
    url: 'http://localhost:8081',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
