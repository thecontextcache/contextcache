import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL: process.env.A11Y_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
