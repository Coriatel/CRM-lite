import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CRM_SMOKE_BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
