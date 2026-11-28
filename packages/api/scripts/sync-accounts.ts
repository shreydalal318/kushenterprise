/**
 * Bring the books up to date (idempotent): system and party ledgers, the books start date, and a
 * voucher for every document that has none yet. scripts/render-start.mjs runs it at each start, so a
 * deployment with documents from before accounts existed gets them posted. Quick when nothing is missing.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { prisma } = await import('@kush/db');
const { describeSync, syncAccounts } = await import('../src/services/accounts/sync');

try {
  const r = await syncAccounts(prisma);
  console.log(describeSync(r));
} finally {
  await prisma.$disconnect();
}
