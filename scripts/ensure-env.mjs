// Create .env from .env.example if missing, and fill AUTH_SECRET with a random value if it is blank.
// Safe to run repeatedly; never overwrites values you have set.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = resolve(root, '.env');
if (!existsSync(env)) { copyFileSync(resolve(root, '.env.example'), env); console.log('Created .env from .env.example'); }
const text = readFileSync(env, 'utf8');
if (/^AUTH_SECRET=("")?\s*$/m.test(text) || !/^AUTH_SECRET=/m.test(text)) {
  const secret = randomBytes(36).toString('base64url');
  const next = /^AUTH_SECRET=/m.test(text) ? text.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret}"`) : `${text}\nAUTH_SECRET="${secret}"\n`;
  writeFileSync(env, next);
  console.log('Generated a random AUTH_SECRET in .env');
}
