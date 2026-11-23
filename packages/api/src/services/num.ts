import type { Prisma } from '@kush/db';

type Dec = Prisma.Decimal | number | null | undefined;

/** Prisma Decimal → number for the wire (money is 2 dp, well inside float precision). */
export const num = (d: Dec): number => (d == null ? 0 : Number(d));
export const numOrNull = (d: Dec): number | null => (d == null ? null : Number(d));

/** Date column (@db.Date) → "YYYY-MM-DD" (or null). */
export const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
/** "YYYY-MM-DD" → Date at UTC midnight for @db.Date columns. */
export const dayToDate = (s: string | null | undefined): Date | null => (s ? new Date(`${s}T00:00:00.000Z`) : null);
