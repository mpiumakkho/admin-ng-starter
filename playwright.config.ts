import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests in e2e/, run against the dev server in the installed Google Chrome: npm run e2e.
 * Each test gets a fresh browser profile, so the sample data starts over every time.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The dev server compiles pages on first request; a few workers and patient waits keep that from failing tests
  workers: 3,
  expect: { timeout: 15_000 },
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
