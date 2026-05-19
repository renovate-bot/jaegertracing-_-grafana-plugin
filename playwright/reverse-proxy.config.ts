import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../tests',
  testMatch: ['**/reverse-proxy.spec.ts'],
  outputDir: '.test-results-reverse-proxy',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { outputFolder: '.report-reverse-proxy', open: 'never' }]],
  use: {
    baseURL: process.env.GRAFANA_URL || 'http://localhost:18082',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
