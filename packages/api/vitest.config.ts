import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('Set TEST_DATABASE_URL (see .env.example) to run API tests');

export default defineConfig({
  test: {
    env: { DATABASE_URL: testDb, NODE_ENV: 'test' },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false, // one shared test database
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
