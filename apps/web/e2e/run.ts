import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const run = JSON.parse(readFileSync(resolve(import.meta.dirname, '.data/run.json'), 'utf8')) as {
  tag: string;
  owner: { email: string; password: string; name: string };
};
