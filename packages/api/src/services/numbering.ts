import { randomUUID } from 'node:crypto';
import { DEFAULT_PREFIXES, financialYear, formatDocNumber, type DocType } from '@kush/core';
import type { Tx } from '@kush/db';

/**
 * Allocate the next document number for a doc type in the financial year of `date`.
 * Must run inside a transaction: the row is locked with SELECT ... FOR UPDATE so concurrent
 * invoices never get the same number and numbers have no gaps (a rolled-back tx releases it).
 */
export async function nextDocNumber(tx: Tx, docType: DocType, date: Date | string = new Date()): Promise<string> {
  const fy = financialYear(date);
  // Create the series for a new financial year on first use (prefix carried over from the previous year).
  // INSERT ... ON CONFLICT is race-safe when two documents open a new year at the same moment.
  const latest = await tx.numberSeries.findFirst({ where: { docType, financialYear: { lt: fy } }, orderBy: { financialYear: 'desc' } });
  await tx.$executeRaw`
    INSERT INTO "NumberSeries" ("id", "docType", "financialYear", "prefix", "nextNumber", "padding")
    VALUES (${randomUUID()}, ${docType}::"DocType", ${fy}, ${latest?.prefix ?? DEFAULT_PREFIXES[docType]}, 1, ${latest?.padding ?? 4})
    ON CONFLICT ("docType", "financialYear") DO NOTHING`;
  const rows = await tx.$queryRaw<{ id: string; prefix: string; nextNumber: number; padding: number }[]>`
    SELECT "id", "prefix", "nextNumber", "padding" FROM "NumberSeries"
    WHERE "docType" = ${docType}::"DocType" AND "financialYear" = ${fy}
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`Number series missing for ${docType} ${fy}`);
  await tx.numberSeries.update({ where: { id: row.id }, data: { nextNumber: row.nextNumber + 1 } });
  return formatDocNumber(row.prefix, fy, row.nextNumber, row.padding);
}
