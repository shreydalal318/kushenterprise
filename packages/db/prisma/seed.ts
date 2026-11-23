/**
 * Foundation seed (idempotent): GST states, company settings with placeholders, number series
 * for the current financial year, product categories, default stock location and the first
 * owner account. Demo masters/transactions are added by later phases.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
import { hash } from '@node-rs/argon2';
import { DEFAULT_PREFIXES, DOC_TYPES, INDIAN_STATES, financialYear, normalizeIndianMobile, passwordError } from '@kush/core';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const s of INDIAN_STATES) {
    await prisma.state.upsert({ where: { code: s.code }, create: s, update: { name: s.name, shortCode: s.shortCode } });
  }

  await prisma.companySettings.upsert({
    where: { id: 'company' },
    create: {
      id: 'company',
      gstRates: [0, 5, 12, 18].map((r) => new Prisma.Decimal(r)),
      notificationConfig: {
        channels: { inApp: true, push: true, sms: false, whatsapp: false, email: true },
        orderStatusToCustomer: true, lowStockToOwner: true, expiryToOwner: true,
      },
      labelSizes: [
        { name: 'Thermal 50×25 mm', widthMm: 50, heightMm: 25, perSheet: 1 },
        { name: 'Thermal 38×25 mm', widthMm: 38, heightMm: 25, perSheet: 1 },
        { name: 'A4 sheet 65-up (38.1×21.2 mm)', widthMm: 38.1, heightMm: 21.2, perSheet: 65 },
      ],
    },
    update: {},
  });

  const fy = financialYear();
  for (const docType of DOC_TYPES) {
    await prisma.numberSeries.upsert({
      where: { docType_financialYear: { docType, financialYear: fy } },
      create: { docType, financialYear: fy, prefix: DEFAULT_PREFIXES[docType] },
      update: {},
    });
  }

  for (const name of ['IOL / Lens', 'Surgical Instrument', 'Consumable', 'Equipment']) {
    await prisma.category.upsert({ where: { name }, create: { name }, update: {} });
  }

  if (!(await prisma.location.findFirst({ where: { isDefault: true } }))) {
    await prisma.location.upsert({ where: { name: 'Main store' }, create: { name: 'Main store', isDefault: true }, update: { isDefault: true } });
  }

  const owners = await prisma.user.count({ where: { role: 'OWNER' } });
  if (owners === 0) {
    const email = process.env.SEED_OWNER_EMAIL?.toLowerCase();
    const password = process.env.SEED_OWNER_PASSWORD;
    if (!email || !password) throw new Error('Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD to create the first owner');
    const pwErr = passwordError(password);
    if (pwErr) throw new Error(`SEED_OWNER_PASSWORD: ${pwErr}`);
    const mobile = process.env.SEED_OWNER_MOBILE ? normalizeIndianMobile(process.env.SEED_OWNER_MOBILE) : null;
    const owner = await prisma.user.create({
      data: {
        role: 'OWNER',
        name: process.env.SEED_OWNER_NAME ?? 'Owner',
        email,
        mobile,
        passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        mustChangePassword: process.env.NODE_ENV === 'production',
      },
    });
    await prisma.activityLog.create({
      data: { actorId: owner.id, action: 'system.seed', entityType: 'User', entityId: owner.id, summary: 'Owner account created by seed' },
    });
    console.log(`Created owner ${email}`);
  }
  console.log(`Seed complete (FY ${fy}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
