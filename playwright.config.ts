import { defineConfig, devices } from '@playwright/test';

const desktop = { viewport: { width: 1440, height: 1000 } };

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...desktop } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...desktop } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...desktop } },
  ],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
