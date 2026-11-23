import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@kush/db';
import { INDIAN_STATES } from '@kush/core';

/** Migrate the test DB (non-destructive) and create a fresh owner for this run. */
export default async function setup() {
  execSync('pnpm exec prisma migrate deploy', { cwd: resolve(import.meta.dirname, '../../../packages/db'), env: process.env, stdio: 'pipe' });
  const prisma = new PrismaClient();
  const tag = randomBytes(3).toString('hex');
  const owner = { email: `owner-${tag}@e2e.local`, password: `E2eOwner${tag}2026`, name: `Owner ${tag}` };
  await prisma.companySettings.upsert({ where: { id: 'company' }, create: { id: 'company', gstRates: [0, 5, 12, 18] }, update: {} });
  for (const st of INDIAN_STATES) await prisma.state.upsert({ where: { code: st.code }, create: st, update: {} });
  for (const name of ['IOL / Lens', 'Surgical Instrument', 'Consumable', 'Equipment']) await prisma.category.upsert({ where: { name }, create: { name }, update: {} });
  await prisma.user.create({
    data: { role: 'OWNER', name: owner.name, email: owner.email, passwordHash: await hash(owner.password) },
  });
  await prisma.$disconnect();
  mkdirSync(resolve(import.meta.dirname, '.data'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '.data/run.json'), JSON.stringify({ tag, owner }));
}
