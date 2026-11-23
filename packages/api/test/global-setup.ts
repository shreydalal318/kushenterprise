import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Bring the test database up to the latest migrations. Non-destructive: tests create their own
 * uniquely-named data, so nothing is wiped between runs.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL!;
  if (!/test/i.test(url)) throw new Error('Refusing to use a database whose URL does not contain "test"');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
