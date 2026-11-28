import { addDays, isBalanced, istDateString, round2 } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { syncAccounts } from '../src/services/accounts/sync';
import { callerFor, makeUser, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let accountant: Awaited<ReturnType<typeof makeUser>>; // VIEW + MANAGE accounts
let viewer: Awaited<ReturnType<typeof makeUser>>; // VIEW only
let clerk: Awaited<ReturnType<typeof makeUser>>; // MANAGE only (enters, sees no balances or reports)
let nobody: Awaited<ReturnType<typeof makeUser>>;
let gj: string; // customer in the company's state → CGST + SGST
let ka: string; // customer in another state → IGST
let local: string; // supplier in the company's state
let mumbai: string; // supplier in another state
let gel5: string;
let drape12: string;

const api = async (u = owner) => (await callerFor(u.id)).api;

/** Voucher of a document as { systemKey | 'PARTY' | ledger name: signed amount }. */
async function posted(sourceType: string, sourceId: string) {
  const v = await prisma.voucher.findUniqueOrThrow({ where: { sourceType_sourceId: { sourceType, sourceId } }, include: { entries: { include: { ledger: true } } } });
  const m: Record<string, number> = {};
  for (const e of v.entries) {
    const k = e.ledger.systemKey ?? (e.ledger.customerId || e.ledger.supplierId ? 'PARTY' : e.ledger.name);
    m[k] = round2((m[k] ?? 0) + Number(e.amount));
  }
  expect(isBalanced(v.entries.map((e) => ({ amount: Number(e.amount) })))).toBe(true);
  return { v, m };
}
const ledgerOf = (where: { customerId: string } | { supplierId: string }) => prisma.ledger.findUniqueOrThrow({ where: 'customerId' in where ? { customerId: where.customerId } : { supplierId: where.supplierId } });
const sysLedger = (systemKey: string) => prisma.ledger.findUniqueOrThrow({ where: { systemKey } });

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '29', name: 'Karnataka', shortCode: 'KA' }, { code: '27', name: 'Maharashtra', shortCode: 'MH' }]) await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  owner = await makeUser('OWNER');
  accountant = await makeUser('EMPLOYEE', { permissions: ['VIEW_ACCOUNTS', 'MANAGE_ACCOUNTS'] });
  viewer = await makeUser('EMPLOYEE', { permissions: ['VIEW_ACCOUNTS'] });
  clerk = await makeUser('EMPLOYEE', { permissions: ['MANAGE_ACCOUNTS'] });
  nobody = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '1 Test Rd', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  const categoryId = (await a.settings.createCategory({ name: `Acc ${tag()}` })).id;
  const g = await a.products.create({ code: `AG${tag()}`.toUpperCase(), name: 'Acc Gel', categoryId, hsnCode: '30049099', gstRate: 5, unit: 'pcs', defaultRate: 420, mrp: 650, purchaseCost: 210 });
  gel5 = (await a.products.get({ id: g.id })).variants[0]!.id;
  const d = await a.products.create({ code: `AD${tag()}`.toUpperCase(), name: 'Acc Drape', categoryId, hsnCode: '63079090', gstRate: 12, unit: 'pcs', defaultRate: 200, mrp: 400, purchaseCost: 100 });
  drape12 = (await a.products.get({ id: d.id })).variants[0]!.id;
  local = (await a.suppliers.create({ name: `Acc Local ${tag()}`, addressLine1: 'GIDC', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  mumbai = (await a.suppliers.create({ name: `Acc Mumbai ${tag()}`, addressLine1: 'MIDC', city: 'Mumbai', stateCode: '27', paymentTermsDays: 45 })).id;
  await a.inventory.createGrn({ supplierId: mumbai, date: today, lines: [
    { variantId: gel5, batchNo: `AG${tag()}`, expiryDate: addDays(today, 500), qty: 200, rate: 210 },
    { variantId: drape12, batchNo: `AD${tag()}`, expiryDate: addDays(today, 500), qty: 200, rate: 100 },
  ] });
  gj = (await a.customers.create({ type: 'HOSPITAL', name: `Acc GJ Hospital ${tag()}`, stateCode: '24', paymentTermsDays: 30, billingAddress: { line1: 'a', city: 'Surat', pincode: '395001', stateCode: '24' } })).id;
  ka = (await a.customers.create({ type: 'CLINIC', name: `Acc KA Clinic ${tag()}`, stateCode: '29', paymentTermsDays: 15, billingAddress: { line1: 'b', city: 'Mysuru', pincode: '570001', stateCode: '29' } })).id;
});

describe('sales postings', () => {
  let invId: string;

  it('posts an intra-state mixed-rate invoice: Dr customer, Cr Sales GST per rate, CGST + SGST, round off credited', async () => {
    // 110 @ 5% + 200 @ 12% = 310 + 29.50 tax = 339.50 → 340 (+0.50)
    const r = await (await api()).invoices.create({ customerId: gj, date: today, lines: [{ variantId: gel5, qty: 1, rate: 110, discPct: 0 }, { variantId: drape12, qty: 1, rate: 200, discPct: 0 }] });
    invId = r.id;
    const { v, m } = await posted('Invoice', r.id);
    expect(m).toEqual({ PARTY: 340, SALES_5: -110, SALES_12: -200, OUTPUT_CGST: -14.75, OUTPUT_SGST: -14.75, ROUND_OFF: -0.5 });
    expect(v).toMatchObject({ type: 'SALES', number: r.number, cancelled: false, partyLedgerId: (await ledgerOf({ customerId: gj })).id });
    expect(Number(v.amount)).toBe(340); // the sum of debits
  });

  it('posts IGST for an inter-state invoice and debits round off when rounded down', async () => {
    // 101 @ 5% IGST = 106.05 → 106 (−0.05)
    const r = await (await api()).invoices.create({ customerId: ka, date: today, lines: [{ variantId: gel5, qty: 1, rate: 101, discPct: 0 }] });
    const { v, m } = await posted('Invoice', r.id);
    expect(m).toEqual({ PARTY: 106, SALES_5: -101, OUTPUT_IGST: -5.05, ROUND_OFF: 0.05 });
    expect(Number(v.amount)).toBe(106.05);
    expect(v.narration).toBe(`Being goods sold vide ${r.number}`);
  });

  it('marks the voucher cancelled when the invoice is cancelled, and the trial balance drops it', async () => {
    const a = await api();
    const cust = (await a.customers.create({ type: 'DOCTOR', name: `Acc Dr Cancel ${tag()}`, stateCode: '24', paymentTermsDays: 7, billingAddress: { line1: 'c', city: 'Rajkot', pincode: '360001', stateCode: '24' } })).id;
    const salesNet = async () => (await a.accounts.reports.trialBalance()).groups.find((g) => g.key === 'SALES')?.closing ?? 0;
    const before = await salesNet();
    const r = await a.invoices.create({ customerId: cust, date: today, lines: [{ variantId: gel5, qty: 2, rate: 420, discPct: 0 }] });
    expect(round2((await salesNet()) - before)).toBe(-840);
    const party = await ledgerOf({ customerId: cust });
    expect((await a.accounts.ledgers.get({ id: party.id })).closing).toBe(r.total);
    await a.invoices.cancel({ id: r.id, reason: 'Billed by mistake' });
    const { v } = await posted('Invoice', r.id);
    expect(v).toMatchObject({ cancelled: true, cancelReason: 'Billed by mistake' });
    expect(round2(await salesNet())).toBe(round2(before));
    expect((await a.accounts.ledgers.get({ id: party.id })).closing).toBe(0);
    expect((await a.accounts.reports.trialBalance()).groups.flatMap((g) => g.ledgers).some((l) => l.id === party.id)).toBe(false);
    expect((await a.accounts.reports.ledger({ ledgerId: party.id })).rows).toEqual([]);
  });

  it('posts a credit note into Sales Returns and output tax', async () => {
    const a = await api();
    const line = (await a.invoices.get({ id: invId })).lines.find((l) => l.variantId === gel5)!;
    const cn = await a.creditNotes.create({ invoiceId: invId, date: today, reason: 'Damaged pack', restock: true, lines: [{ invoiceLineId: line.id, qty: 1 }] });
    // 110 + 2.75 + 2.75 = 115.50 → 116
    const { v, m } = await posted('CreditNote', cn.id);
    expect(m).toEqual({ PARTY: -116, SALES_RETURNS: 110, OUTPUT_CGST: 2.75, OUTPUT_SGST: 2.75, ROUND_OFF: 0.5 });
    expect(v.type).toBe('CREDIT_NOTE');
    expect(v.narration).toContain('Damaged pack');
  });

  it('posts receipts to Cash or the bank, follows allocations, and removes the voucher with the payment', async () => {
    const a = await api();
    const cash = await a.payments.record({ customerId: gj, date: today, amount: 100, mode: 'CASH' });
    expect((await posted('Payment', cash.id)).m).toEqual({ CASH: 100, PARTY: -100 });
    const neft = await a.payments.record({ customerId: gj, date: today, amount: 50, mode: 'NEFT_RTGS', reference: 'UTR778899', allocations: [{ invoiceId: invId, amount: 50 }] });
    const n = await posted('Payment', neft.id);
    expect(n.m).toEqual({ BANK: 50, PARTY: -50 });
    expect(n.v.type).toBe('RECEIPT');
    expect(n.v.narration).toMatch(/NEFT \/ RTGS UTR778899 against KE\//);
    // Money into a second bank account the owner set up
    const hdfc = await a.accounts.ledgers.create({ name: `HDFC Current ${tag()}`, group: 'BANK_ACCOUNTS', openingBalance: 0, bankAccountNo: '5010001234', bankIfsc: 'hdfc0001234' });
    expect(hdfc.bankIfsc).toBe('HDFC0001234');
    const upi = await a.payments.record({ customerId: gj, date: today, amount: 25, mode: 'UPI', ledgerId: hdfc.id });
    expect((await posted('Payment', upi.id)).m).toEqual({ [hdfc.name]: 25, PARTY: -25 });
    await expect(a.payments.record({ customerId: gj, date: today, amount: 1, mode: 'UPI', ledgerId: (await sysLedger('ROUND_OFF')).id })).rejects.toThrow(/not a cash or bank ledger/);
    // On account, then applied: the narration now names the invoice
    expect((await posted('Payment', cash.id)).v.narration).toMatch(/on account/);
    await a.payments.allocate({ paymentId: cash.id, allocations: [{ invoiceId: invId, amount: 100 }] });
    expect((await posted('Payment', cash.id)).v.narration).toMatch(/against KE\//);
    await a.payments.remove({ id: neft.id, reason: 'Entered twice' });
    expect(await prisma.voucher.count({ where: { sourceType: 'Payment', sourceId: neft.id } })).toBe(0);
  });
});

describe('purchase postings', () => {
  let courier: { id: string; name: string };
  let localBill: string;

  it('posts a purchase bill: Dr Purchase GST r% and the line ledger, Dr input tax, Cr supplier', async () => {
    const a = await api(accountant);
    courier = await a.accounts.ledgers.create({ name: `Courier Charges ${tag()}`, group: 'INDIRECT_EXPENSES', openingBalance: 0 });
    const billNo = `LS/${tag()}`;
    const b = await a.accounts.purchaseBills.create({ supplierId: local, billNo, billDate: today, lines: [
      { variantId: gel5, qty: 10, rate: 200, discPct: 0 },
      { ledgerId: courier.id, rate: 100, gstRate: 18, discPct: 0 },
    ] });
    localBill = b.id;
    expect(b.number).toMatch(/^KE\/PB\//);
    expect(b.total).toBe(2218); // 2000 + 100 + 59 + 59
    const { v, m } = await posted('PurchaseBill', b.id);
    expect(m).toEqual({ PARTY: -2218, PURCHASE_5: 2000, [courier.name]: 100, INPUT_CGST: 59, INPUT_SGST: 59 });
    expect(v).toMatchObject({ type: 'PURCHASE', number: b.number });
    expect((await prisma.voucherEntry.findFirstOrThrow({ where: { voucherId: v.id, ledger: { supplierId: local } } })).billRef).toBe(billNo);
    const got = await a.accounts.purchaseBills.get({ id: b.id });
    expect(got).toMatchObject({ taxType: 'INTRA_STATE', grandTotal: 2218, due: 2218, voucherId: v.id });
    expect(got.dueDate).toBe(addDays(today, 30));
    await expect(a.accounts.purchaseBills.create({ supplierId: local, billNo, billDate: today, lines: [{ variantId: gel5, qty: 1, rate: 1, discPct: 0 }] })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('matches the printed bill total within ₹1 through round off, and refuses a bigger gap', async () => {
    const a = await api(accountant);
    // 3 × 99.90 = 299.70 @ 12% IGST = 35.96 → 335.66; the supplier printed 336
    const b = await a.accounts.purchaseBills.create({ supplierId: mumbai, billNo: `MO/${tag()}`, billDate: today, billTotal: 336, lines: [{ variantId: drape12, qty: 3, rate: 99.9, discPct: 0 }] });
    expect((await posted('PurchaseBill', b.id)).m).toEqual({ PARTY: -336, PURCHASE_12: 299.7, INPUT_IGST: 35.96, ROUND_OFF: 0.34 });
    await expect(a.accounts.purchaseBills.create({ supplierId: mumbai, billNo: `MO/${tag()}`, billDate: today, billTotal: 340, lines: [{ variantId: drape12, qty: 3, rate: 99.9, discPct: 0 }] })).rejects.toThrow(/differs from items \+ GST/);
    // Cancelling (owner only) marks its voucher cancelled
    await expect(a.accounts.purchaseBills.cancel({ id: b.id, reason: 'Entered twice' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await (await api()).accounts.purchaseBills.cancel({ id: b.id, reason: 'Entered twice' });
    expect((await posted('PurchaseBill', b.id)).v.cancelled).toBe(true);
  });

  it('posts supplier payments against bills from the bank or cash', async () => {
    const a = await api(accountant);
    const p1 = await a.accounts.supplierPayments.create({ supplierId: local, date: today, amount: 1000, mode: 'NEFT_RTGS', reference: 'UTR-PAY-1', allocations: [{ billId: localBill, amount: 1000 }] });
    expect(p1.number).toMatch(/^KE\/PV\//);
    const { v, m } = await posted('SupplierPayment', p1.id);
    expect(m).toEqual({ PARTY: 1000, BANK: -1000 });
    expect(v.type).toBe('PAYMENT');
    expect((await a.accounts.purchaseBills.get({ id: localBill })).due).toBe(1218);
    const p2 = await a.accounts.supplierPayments.create({ supplierId: local, date: today, amount: 1218, mode: 'CASH', autoAllocate: true });
    expect(p2.onAccount).toBe(0);
    expect((await posted('SupplierPayment', p2.id)).m).toEqual({ PARTY: 1218, CASH: -1218 });
    expect((await a.accounts.purchaseBills.get({ id: localBill })).due).toBe(0);
    await expect((await api()).accounts.purchaseBills.cancel({ id: localBill, reason: 'Wrong supplier' })).rejects.toThrow(/Payments are applied/);
    // The supplier's ledger is square: billed 2218, paid 2218.
    expect((await a.accounts.ledgers.get({ id: (await ledgerOf({ supplierId: local })).id })).closing).toBe(0);
  });

  it('values a return to supplier at batch cost with GST and posts the debit note', async () => {
    const a = await api();
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: gel5 } });
    const r = await a.inventory.returnToSupplier({ supplierId: mumbai, date: today, reason: 'Short expiry', lines: [{ variantId: gel5, batchId: batch.id, qty: 2, serialNos: [] }] });
    expect(r.total).toBe(441); // 2 × 210 + 5% IGST
    const row = await prisma.supplierReturn.findUniqueOrThrow({ where: { id: r.id } });
    expect({ taxType: row.taxType, taxable: Number(row.taxableTotal), igst: Number(row.igstTotal), total: Number(row.grandTotal) }).toEqual({ taxType: 'INTER_STATE', taxable: 420, igst: 21, total: 441 });
    const { v, m } = await posted('SupplierReturn', r.id);
    expect(m).toEqual({ PARTY: 441, PURCHASE_RETURNS: -420, INPUT_IGST: -21 });
    expect(v).toMatchObject({ type: 'DEBIT_NOTE', number: r.number });
  });
});

describe('manual vouchers', () => {
  let rent: { id: string; name: string };
  let payable: { id: string; name: string };
  let interest: { id: string; name: string };
  let cash: string;
  let bank: string;

  beforeAll(async () => {
    const a = await api(accountant);
    rent = await a.accounts.ledgers.create({ name: `Office Rent ${tag()}`, group: 'INDIRECT_EXPENSES', openingBalance: 0 });
    payable = await a.accounts.ledgers.create({ name: `Rent Payable ${tag()}`, group: 'PROVISIONS', openingBalance: 0 });
    interest = await a.accounts.ledgers.create({ name: `Bank Interest ${tag()}`, group: 'INDIRECT_INCOMES', openingBalance: 0 });
    cash = (await sysLedger('CASH')).id;
    bank = (await sysLedger('BANK')).id;
  });

  it('enforces Tally rules for Payment, Receipt, Contra and Journal', async () => {
    const a = await api(accountant);
    const v = (type: 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL', entries: { ledgerId: string; amount: number }[]) => a.accounts.vouchers.create({ type, date: today, narration: 'test', entries });
    const pay = await v('PAYMENT', [{ ledgerId: rent.id, amount: 5000 }, { ledgerId: cash, amount: -5000 }]);
    expect(pay.number).toMatch(/^KE\/PV\//);
    await expect(v('PAYMENT', [{ ledgerId: cash, amount: 100 }, { ledgerId: rent.id, amount: -100 }])).rejects.toThrow(/only cash \/ bank ledgers can be credited/);
    await expect(v('PAYMENT', [{ ledgerId: (await ledgerOf({ supplierId: local })).id, amount: 100 }, { ledgerId: bank, amount: -100 }])).rejects.toThrow(/Supplier payments/);
    const rec = await v('RECEIPT', [{ ledgerId: bank, amount: 300 }, { ledgerId: interest.id, amount: -300 }]);
    expect(rec.number).toMatch(/^KE\/RC\//);
    await expect(v('RECEIPT', [{ ledgerId: rent.id, amount: 300 }, { ledgerId: interest.id, amount: -300 }])).rejects.toThrow(/only cash \/ bank ledgers can be debited/);
    await expect(v('RECEIPT', [{ ledgerId: bank, amount: 300 }, { ledgerId: (await ledgerOf({ customerId: gj })).id, amount: -300 }])).rejects.toThrow(/under Payments/);
    const contra = await v('CONTRA', [{ ledgerId: bank, amount: 2000 }, { ledgerId: cash, amount: -2000 }]);
    expect(contra.number).toMatch(/^KE\/CV\//);
    await expect(v('CONTRA', [{ ledgerId: rent.id, amount: 10 }, { ledgerId: cash, amount: -10 }])).rejects.toThrow(/only moves money between cash and bank/);
    const jv = await v('JOURNAL', [{ ledgerId: rent.id, amount: 500 }, { ledgerId: payable.id, amount: -500 }]);
    expect(jv.number).toMatch(/^KE\/JV\//);
    await expect(v('JOURNAL', [{ ledgerId: rent.id, amount: 500 }, { ledgerId: cash, amount: -500 }])).rejects.toThrow(/can't touch cash or bank/);
    await expect(v('JOURNAL', [{ ledgerId: rent.id, amount: 500 }, { ledgerId: payable.id, amount: -499.99 }])).rejects.toThrow(/must be equal/);
    await expect(v('JOURNAL', [{ ledgerId: rent.id, amount: 500 }, { ledgerId: payable.id, amount: 0 }])).rejects.toThrow(/at least one debit and one credit/);

    const got = await a.accounts.vouchers.get({ id: pay.id });
    expect(got).toMatchObject({ type: 'PAYMENT', manual: true, amount: 5000, party: { id: rent.id } });
    expect(got.entries.map((e) => [e.ledgerId, e.debit, e.credit])).toEqual([[rent.id, 5000, 0], [cash, 0, 5000]]);
    const book = await a.accounts.vouchers.list({ from: today, to: today, type: 'CONTRA' });
    expect(book.rows.find((r) => r.id === contra.id)).toMatchObject({ particulars: (await sysLedger('BANK')).name, debit: 2000, credit: 0 });
  });

  it('cancels manual vouchers (owner only) but never auto-posted ones', async () => {
    const a = await api(accountant);
    const pay = await a.accounts.vouchers.create({ type: 'PAYMENT', date: today, narration: 'wrong amount', entries: [{ ledgerId: rent.id, amount: 999 }, { ledgerId: cash, amount: -999 }] });
    await expect(a.accounts.vouchers.cancel({ id: pay.id, reason: 'Wrong amount' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const o = await api();
    await o.accounts.vouchers.cancel({ id: pay.id, reason: 'Wrong amount' });
    const book = await o.accounts.vouchers.list({ from: today, to: today, ledgerId: rent.id });
    expect(book.rows.find((r) => r.id === pay.id)).toMatchObject({ cancelled: true, debit: 0, credit: 0 });
    await expect(o.accounts.vouchers.cancel({ id: pay.id, reason: 'Again please' })).rejects.toThrow(/Already cancelled/);
    const auto = await prisma.voucher.findFirstOrThrow({ where: { sourceType: 'Invoice' } });
    await expect(o.accounts.vouchers.cancel({ id: auto.id, reason: 'Not allowed' })).rejects.toThrow(/comes from its invoice/);
    // Rent: 5000 paid + 500 journal; the cancelled 999 is left out.
    expect((await o.accounts.ledgers.get({ id: rent.id })).closing).toBe(5500);
  });

  it('gates reading on VIEW_ACCOUNTS and entering on MANAGE_ACCOUNTS', async () => {
    const v = await api(viewer);
    expect((await v.accounts.reports.trialBalance()).totals.debit).toBeGreaterThan(0);
    await expect(v.accounts.vouchers.create({ type: 'CONTRA', date: today, entries: [{ ledgerId: bank, amount: 1 }, { ledgerId: cash, amount: -1 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const c = await api(clerk);
    const list = await c.accounts.ledgers.list({ cashBank: true });
    expect(list.every((l) => l.isCashBank && l.closing === null)).toBe(true);
    await expect(c.accounts.reports.trialBalance()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const n = await api(nobody);
    await expect(n.accounts.ledgers.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(n.accounts.sync()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ledgers and reports', () => {
  it('keeps system and party ledgers safe to edit, and party names in step with the master', async () => {
    const a = await api(accountant);
    const cgst = await sysLedger('OUTPUT_CGST');
    const base = { group: cgst.group, openingBalance: 0, isActive: true };
    await expect(a.accounts.ledgers.update({ id: cgst.id, name: 'My CGST', ...base })).rejects.toThrow(/used by the app/);
    await expect(a.accounts.ledgers.update({ id: cgst.id, name: cgst.name, ...base, group: 'SUSPENSE' })).rejects.toThrow(/is fixed/);
    await expect(a.accounts.ledgers.update({ id: cgst.id, name: cgst.name, ...base, isActive: false })).rejects.toThrow(/can't be made inactive/);
    // The default bank can be renamed to the real bank's name.
    const bank = await sysLedger('BANK');
    const renamed = `${bank.name} ${tag()}`;
    await a.accounts.ledgers.update({ id: bank.id, name: renamed, group: 'BANK_ACCOUNTS', openingBalance: 0, isActive: true });
    await a.accounts.ledgers.update({ id: bank.id, name: bank.name, group: 'BANK_ACCOUNTS', openingBalance: Number(bank.openingBalance), bankAccountNo: bank.bankAccountNo, bankIfsc: bank.bankIfsc, isActive: true });
    const party = await ledgerOf({ supplierId: mumbai });
    await expect(a.accounts.ledgers.update({ id: party.id, name: 'Other', group: 'SUNDRY_CREDITORS', openingBalance: 0, isActive: true })).rejects.toThrow(/rename it there/);
    await expect(a.accounts.ledgers.update({ id: party.id, name: party.name, group: 'SUNDRY_DEBTORS', openingBalance: 0, isActive: true })).rejects.toThrow(/is fixed/);
    await expect(a.accounts.ledgers.create({ name: party.name.toUpperCase(), group: 'SUNDRY_CREDITORS', openingBalance: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
    const newName = `Acc Mumbai Renamed ${tag()}`;
    await (await api()).suppliers.update({ id: mumbai, name: newName, addressLine1: 'MIDC', city: 'Mumbai', stateCode: '27', paymentTermsDays: 45 });
    expect((await ledgerOf({ supplierId: mumbai })).name).toBe(newName);
  });

  it('prints a party ledger Tally-style: To / By the other ledger, running balance, closing', async () => {
    const a = await api(viewer);
    const party = await ledgerOf({ customerId: gj });
    const rep = await a.accounts.reports.ledger({ ledgerId: party.id, from: today, to: today });
    expect(rep.opening).toBe(0);
    const [sale, cn] = rep.rows;
    expect(sale).toMatchObject({ particulars: 'To Sales GST 12%', vchType: 'Sales', debit: 340, credit: 0, balance: 340 });
    expect(sale!.details.length).toBe(5); // two sales ledgers, CGST, SGST, round off
    expect(cn).toMatchObject({ particulars: 'By Sales Returns', vchType: 'Credit Note', credit: 116 });
    expect(rep.rows.some((r) => r.particulars === 'By Cash' && r.credit === 100)).toBe(true);
    // 340 − 116 − 100 (cash) − 25 (UPI); the NEFT receipt was deleted
    expect(rep.closing).toBe(99);
    expect(rep.closing).toBe(round2(rep.opening + rep.totals.debit - rep.totals.credit));
    expect((await a.accounts.ledgers.list({ q: party.name })).find((l) => l.id === party.id)?.closing).toBe(99);
  });

  it('balances the trial balance after everything above, with any opening difference shown', async () => {
    const a = await api(accountant);
    await a.accounts.ledgers.create({ name: `Old Advance ${tag()}`, group: 'LOANS_ADVANCES', openingBalance: 750 });
    const tb = await (await api(viewer)).accounts.reports.trialBalance();
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.totals.debit).toBeGreaterThan(0);
    const openings = round2(Number((await prisma.ledger.aggregate({ _sum: { openingBalance: true } }))._sum.openingBalance ?? 0));
    expect(round2((tb.openingDifference?.credit ?? 0) - (tb.openingDifference?.debit ?? 0))).toBe(openings);
    // Sub-groups roll up into their primary group.
    const ca = tb.groups.find((g) => g.key === 'CURRENT_ASSETS')!;
    const kids = tb.groups.filter((g) => g.parent === 'CURRENT_ASSETS').reduce((t, g) => t + g.closing, 0);
    expect(round2(ca.closing)).toBe(round2(kids + ca.ledgers.reduce((t, l) => t + l.closing, 0)));
  });
});

describe('syncAccounts', () => {
  it('backfills documents that have no voucher and is idempotent', async () => {
    const a = await api();
    const inv = await a.invoices.create({ customerId: ka, date: today, lines: [{ variantId: drape12, qty: 2, rate: 199.5, discPct: 0 }] });
    const pay = await a.payments.record({ customerId: ka, date: today, amount: 200, mode: 'CHEQUE', reference: 'CHQ 1234' });
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: drape12 } });
    const ret = await a.inventory.returnToSupplier({ supplierId: local, date: today, reason: 'Torn packs', lines: [{ variantId: drape12, batchId: batch.id, qty: 1, serialNos: [] }] });
    const want = { inv: (await posted('Invoice', inv.id)).m, pay: (await posted('Payment', pay.id)).m, ret: (await posted('SupplierReturn', ret.id)).m };
    expect(want.ret).toEqual({ PARTY: 112, PURCHASE_RETURNS: -100, INPUT_CGST: -6, INPUT_SGST: -6 });
    // As if these were entered before accounts existed.
    await prisma.voucher.deleteMany({ where: { sourceId: { in: [inv.id, pay.id, ret.id] } } });
    await prisma.supplierReturn.update({ where: { id: ret.id }, data: { taxableTotal: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, taxTotal: 0, roundOff: 0, grandTotal: 0 } });

    const first = await syncAccounts(prisma);
    expect(first.errors).toEqual([]);
    expect(first.posted.Invoice).toBeGreaterThanOrEqual(1);
    expect(first.booksFrom).toMatch(/^\d{4}-04-01$/);
    expect((await posted('Invoice', inv.id)).m).toEqual(want.inv);
    expect((await posted('Payment', pay.id)).m).toEqual(want.pay);
    expect((await posted('SupplierReturn', ret.id)).m).toEqual(want.ret);
    expect(Number((await prisma.supplierReturn.findUniqueOrThrow({ where: { id: ret.id } })).grandTotal)).toBe(112);

    const count = await prisma.voucher.count();
    const second = await syncAccounts(prisma);
    expect(second.posted).toEqual({ Invoice: 0, CreditNote: 0, Payment: 0, PurchaseBill: 0, SupplierReturn: 0, SupplierPayment: 0 });
    expect(second.ledgersCreated).toBe(0);
    expect(await prisma.voucher.count()).toBe(count);
    // Every customer and supplier has its ledger now.
    expect(await prisma.customer.count({ where: { ledger: null } })).toBe(0);
    expect(await prisma.supplier.count({ where: { ledger: null } })).toBe(0);
    const tb = await a.accounts.reports.trialBalance();
    expect(tb.totals.debit).toBe(tb.totals.credit);
  }, 600_000);
});
