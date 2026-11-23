import { TRPCError } from '@trpc/server';
import { istDateString, stateByCode } from '@kush/core';
import type { CompanySettings, Prisma, Tx } from '@kush/db';
import { isoDay, num } from '../num';
import { getSettings } from '../settings';
import { fefoPick, loadVariant, type VariantWithProduct } from '../stock';

/** Supplier block exactly as printed (stored on each document so later settings edits don't change it). */
export function supplierSnapshot(s: CompanySettings) {
  return {
    name: s.legalName,
    addressLines: [s.addressLine1, s.addressLine2, `${s.city} - ${s.pincode}`].filter(Boolean) as string[],
    phone: s.phone, email: s.email, gstin: s.gstin,
    stateName: stateByCode(s.stateCode)?.name ?? '[State Name]', stateCode: s.stateCode,
    pan: s.pan, drugLicence: s.drugLicenceNo, jurisdiction: s.jurisdictionCity,
    declaration: s.invoiceDeclaration,
    bank: { holder: s.legalName, name: s.bankName, account: s.bankAccountNo, branchIfsc: `${s.bankBranch} & ${s.bankIfsc}` },
    upiId: s.upiId,
  };
}
export type SupplierSnapshot = ReturnType<typeof supplierSnapshot>;

/** GST needs a real company state to decide CGST+SGST vs IGST. */
export async function requireCompanyState(tx: Tx) {
  const s = await getSettings(tx);
  if (!stateByCode(s.stateCode)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Set the company state (and GSTIN) in Settings → Company before issuing GST documents' });
  }
  return s;
}

type AddressRow = Prisma.AddressGetPayload<object>;
export function partySnapshot(c: { name: string; gstin: string | null; drugLicenceNo: string | null }, a: AddressRow, attn?: string | null) {
  return {
    name: c.name,
    attn: attn ?? null,
    addressLines: [a.line1, a.line2, `${a.city} - ${a.pincode}`].filter(Boolean) as string[],
    gstin: a.gstin ?? c.gstin,
    stateName: stateByCode(a.stateCode)?.name ?? a.stateCode,
    stateCode: a.stateCode,
    drugLicence: c.drugLicenceNo,
  };
}
export type PartySnapshot = ReturnType<typeof partySnapshot>;

/** Load an active customer with the billing and ship-to addresses for a document. */
export async function customerForDocument(tx: Tx, customerId: string, opts: { shippingAddressId?: string | null; forDoctorId?: string | null }) {
  const c = await tx.customer.findUnique({ where: { id: customerId }, include: { addresses: true } });
  if (!c || c.deletedAt || !c.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an active customer' });
  const billing = c.addresses.find((a) => a.kind === 'BILLING' && a.isDefault) ?? c.addresses.find((a) => a.kind === 'BILLING');
  if (!billing) throw new TRPCError({ code: 'BAD_REQUEST', message: `${c.name} has no billing address` });
  let ship = billing;
  if (opts.shippingAddressId) {
    const a = c.addresses.find((x) => x.id === opts.shippingAddressId);
    if (!a) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That delivery address does not belong to this customer' });
    ship = a;
  } else {
    ship = c.addresses.find((a) => a.kind === 'SHIPPING' && a.isDefault) ?? billing;
  }
  let doctor: { id: string; name: string } | null = null;
  if (opts.forDoctorId) {
    const d = await tx.customer.findUnique({ where: { id: opts.forDoctorId }, select: { id: true, name: true, parentId: true, type: true } });
    if (!d || d.type !== 'DOCTOR' || d.parentId !== c.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That doctor is not linked to this customer' });
    doctor = d;
  }
  return {
    customer: c,
    buyer: partySnapshot(c, billing),
    consignee: partySnapshot(c, ship, doctor ? `Attn: ${doctor.name}` : c.contactPerson ? `Attn: ${c.contactPerson}` : null),
    placeOfSupply: ship.stateCode, // goods: where the movement ends (the ship-to address)
    shippingAddressId: ship.id,
    doctor,
  };
}

export interface Allocation { batchId: string; batchNo: string; expiryDate: string | null; locationId: string; qty: number; serialNos: string[]; unitCost: number }

/**
 * Decide which batch(es) a sale line comes from:
 *  - serial-tracked items: the serials given (each serial knows its batch);
 *  - a batch chosen / scanned: that batch;
 *  - otherwise: first-expiry-first-out across unexpired batches (may split the line).
 */
export async function allocateLine(tx: Tx, v: VariantWithProduct, line: { qty: number; batchId?: string | null; serialNos?: string[] }, today = istDateString()): Promise<Allocation[]> {
  const name = `${v.product.name} ${v.label ?? ''}`.trim();
  const cost = (b: { unitCost: Prisma.Decimal | null }) => num(b.unitCost ?? v.purchaseCost ?? v.product.purchaseCost);
  const serials = [...new Set((line.serialNos ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))];

  if (v.product.trackSerial) {
    if (serials.length !== line.qty) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: scan or choose ${line.qty} serial number(s) (got ${serials.length})` });
    const units = await tx.serialUnit.findMany({ where: { serialNo: { in: serials }, status: 'IN_STOCK', batch: { variantId: v.id } }, include: { batch: true } });
    const missing = serials.filter((s) => !units.some((u) => u.serialNo === s));
    if (missing.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: serial ${missing.join(', ')} is not in stock` });
    const byBatch = new Map<string, Allocation>();
    for (const u of units) {
      const exp = isoDay(u.batch.expiryDate);
      if (exp && exp < today) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: serial ${u.serialNo} is from batch ${u.batch.batchNo}, expired on ${exp}` });
      if (line.batchId && u.batchId !== line.batchId) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: serial ${u.serialNo} is not in the chosen batch` });
      const key = `${u.batchId}|${u.locationId}`;
      const a = byBatch.get(key) ?? { batchId: u.batchId, batchNo: u.batch.batchNo, expiryDate: exp, locationId: u.locationId!, qty: 0, serialNos: [], unitCost: cost(u.batch) };
      a.qty++; a.serialNos.push(u.serialNo);
      byBatch.set(key, a);
    }
    return [...byBatch.values()];
  }

  if (serials.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name} does not track serial numbers` });
  if (line.batchId) {
    const b = await tx.batch.findUnique({ where: { id: line.batchId } });
    if (!b || b.variantId !== v.id) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: batch not found` });
    const exp = isoDay(b.expiryDate);
    if (exp && exp < today) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: batch ${b.batchNo} expired on ${exp}` });
    const bal = await tx.stockBalance.findFirst({ where: { variantId: v.id, batchId: b.id, qty: { gte: line.qty } }, orderBy: { qty: 'desc' } });
    if (!bal) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: not enough stock in batch ${b.batchNo}` });
    return [{ batchId: b.id, batchNo: b.batchNo, expiryDate: exp, locationId: bal.locationId, qty: line.qty, serialNos: [], unitCost: cost(b) }];
  }
  const { picks, short } = await fefoPick(tx, v.id, line.qty, { today });
  if (short > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `${name}: only ${line.qty - short} in stock (unexpired), ${line.qty} needed` });
  const batches = await tx.batch.findMany({ where: { id: { in: picks.map((p) => p.batchId) } } });
  return picks.map((p) => ({ batchId: p.batchId, batchNo: p.batchNo, expiryDate: p.expiryDate, locationId: p.locationId, qty: p.qty, serialNos: [], unitCost: cost(batches.find((b) => b.id === p.batchId)!) }));
}

export { loadVariant };
