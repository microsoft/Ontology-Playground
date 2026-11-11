import { defineConfig } from '@playwright/test';

const port = 4182;

export default defineConfig({
  testDir: './tests/performance',
  outputDir: './test-results/large-graph',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: {
      width: 1440,
      height: 1000,
    },
    launchOptions: {
      args: ['--enable-precise-memory-info'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
