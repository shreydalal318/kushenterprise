import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export type * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __kushPrisma?: PrismaClient };

/** Single PrismaClient per process (survives Next.js hot reload in dev). */
export const prisma: PrismaClient =
  globalForPrisma.__kushPrisma ??
  new PrismaClient({ log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__kushPrisma = prisma;

/** Transaction client type, for services that run inside prisma.$transaction. */
export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
export type Db = PrismaClient | Tx;
