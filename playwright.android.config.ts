import { defineConfig } from '@playwright/test';

// Needs an Android emulator or device on adb; see tests/android/fontscale.spec.ts.
export default defineConfig({
  testDir: './tests/android',
  workers: 1,
  timeout: 120_000,
  use: { screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
