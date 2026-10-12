import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/static-server.mjs',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
