import type { Db } from '@kush/db';

/** Atomically increment and return a global counter (race-safe, no gaps on commit). */
export async function nextCounter(db: Db, key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return rows[0]!.value;
}

/** Internal Code 128 barcode for a product variant: KE00000123. */
export const nextBarcode = async (db: Db) => `KE${String(await nextCounter(db, 'barcode')).padStart(8, '0')}`;
export const nextCustomerCode = async (db: Db) => `CUST-${String(await nextCounter(db, 'customer')).padStart(4, '0')}`;
export const nextSupplierCode = async (db: Db) => `SUP-${String(await nextCounter(db, 'supplier')).padStart(3, '0')}`;
