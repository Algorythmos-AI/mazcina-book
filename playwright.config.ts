import { defineConfig, devices } from '@playwright/test';

/**
 * Phone-sized checks of the main jobs, against the local dev server and the
 * DEV database (never production): they add real prices, counts and a recipe
 * to the dev copy. Needs E2E_EMAIL, an address on the dev team list; the
 * sign-in code is read from what the dev server would have emailed.
 *
 *   E2E_EMAIL=you@example.com npm run test:e2e
 */
const port = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Pixel 7'],
    viewport: { width: 375, height: 812 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'sign-in', testMatch: /sign-in\.setup\.ts/ },
    { name: 'phone', dependencies: ['sign-in'], use: { storageState: 'e2e/.auth/state.json' } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
