import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('Set TEST_DATABASE_URL to run end-to-end tests');
process.env.DATABASE_URL = testDb; // global setup + server both use the test database

const PORT = 3100;
const preinstalled = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    launchOptions: existsSync(preinstalled) && !process.env.PW_USE_BUNDLED ? { executablePath: preinstalled } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.E2E_SCREENSHOTS ? { deviceScaleFactor: 2 } : {}) } }],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: testDb, SMS_PROVIDER: 'console', COOKIE_SECURE: 'false', AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-only-auth-secret-not-used-anywhere-else-0123456789' },
  },
});
