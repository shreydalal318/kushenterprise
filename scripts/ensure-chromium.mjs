// Make sure a Chromium is available for invoice / PO / statement PDFs. Installs Playwright's
// Chromium only when none is found. Never fails the caller: without Chromium the app still runs,
// only PDF downloads show an error.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const known = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
if (known.some((p) => existsSync(p))) process.exit(0);
try {
  const require = createRequire(resolve(root, 'packages/pdf/package.json'));
  const exe = require('playwright-core').chromium.executablePath();
  if (exe && existsSync(exe)) process.exit(0);
} catch { /* not installed yet */ }

const linux = process.platform === 'linux';
const canSudo = linux && (process.getuid?.() === 0 || (() => { try { execSync('sudo -n true', { stdio: 'ignore' }); return true; } catch { return false; } })());
console.log(`Installing Chromium for PDFs${canSudo ? ' (with system libraries)' : ''}... this happens once.`);
try {
  execSync(`pnpm --filter @kush/web exec playwright install ${canSudo ? '--with-deps ' : ''}chromium`, { cwd: root, stdio: 'inherit' });
} catch {
  console.warn('Could not install Chromium. The app works, but PDF downloads will fail until it is installed:\n  pnpm --filter @kush/web exec playwright install chromium');
}
