import { defineConfig, devices } from '@playwright/test';

// Exercises the actual development command and Vite proxy, not browser-server.js.
export default defineConfig({
  testDir: './tests/dev-e2e',
  outputDir: './test-results/dev-e2e',
  workers: 1,
  timeout: 45000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:test-access',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      DOTENV_CONFIG_PATH: 'NUL',
      DATABASE_URL: '',
      POSTGRES_URL: '',
      DEMO_MODE: 'true',
      NODE_ENV: 'development',
      VERCEL: '',
      PORT: '3001',
      APP_URL: 'http://localhost:5173',
    },
  },
});
