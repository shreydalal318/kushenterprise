import { TRPCError } from '@trpc/server';
import { formatDate, INVOICE_COPY_LABEL, type InvoiceCopy } from '@kush/core';
import type { Db } from '@kush/db';
import { buildDocModel, renderDocumentPdf, type DocParty, type DocSource, type DocSupplier } from '@kush/pdf';
import { loadFile } from '../../storage';
import { isoDay, num } from '../num';
import { getSettings } from '../settings';

export type DocKind = 'invoice' | 'proforma' | 'credit-note';

const d = (x: Date | null | undefined) => (x ? formatDate(isoDay(x)) : '');

async function signature(db: Db): Promise<string | null> {
  const s = await getSettings(db);
  if (!s.signatureFileId) return null;
  const f = await loadFile(db, s.signatureFileId).catch(() => null);
  return f ? `data:${f.asset.mimeType};base64,${f.body.toString('base64')}` : null;
}

/** Build the printable source for a stored document. Uses only the document's own snapshots. */
export async function documentSource(db: Db, kind: DocKind, id: string, copies: InvoiceCopy[] = ['ORIGINAL']): Promise<{ src: DocSource; filename: string; customerId: string }> {
  if (kind === 'invoice') {
    const i = await db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } }, order: { select: { number: true, createdAt: true } } } });
    if (!i) throw new TRPCError({ code: 'NOT_FOUND' });
    const supplier = i.supplierSnapshot as unknown as DocSupplier;
    return {
      customerId: i.customerId,
      filename: `${i.number.replace(/\//g, '-')}.pdf`,
      src: {
        title: 'TAX INVOICE', numberLabel: 'Invoice No.', number: i.number, date: isoDay(i.date)!,
        copies: copies.map((c) => INVOICE_COPY_LABEL[c]),
        supplier: { ...supplier, declaration: i.terms ? `${supplier.declaration} ${i.terms}` : supplier.declaration },
        consignee: i.consigneeSnapshot as unknown as DocParty, buyer: i.buyerSnapshot as unknown as DocParty, placeOfSupplyCode: i.placeOfSupply,
        refs: [
          ['Delivery Note', i.deliveryNote], ['Mode/Terms of Payment', i.paymentTerms],
          ['Reference No. & Date.', i.referenceNo], ['Other References', i.otherReferences ?? (i.order ? i.order.number : null)],
          ["Buyer's Order No.", i.buyersOrderNo], ['Dated', d(i.buyersOrderDate)],
          ['Dispatch Doc No.', i.dispatchDocNo], ['Delivery Note Date', ''],
          ['Dispatched through', i.dispatchedThrough], ['Destination', i.destination],
        ],
        termsLabel: 'Terms of Delivery', terms: i.termsOfDelivery,
        lines: i.lines.map((l) => ({ description: l.description, hsn: l.hsnCode, qty: l.qty, unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate), batchNo: l.batchNo, expiryDate: isoDay(l.expiryDate), powerLabel: l.powerLabel, serialNos: l.serialNos })),
        stored: { taxable: num(i.taxableTotal), totalTax: num(i.cgstTotal) + num(i.sgstTotal) + num(i.igstTotal), roundOff: num(i.roundOff), total: num(i.grandTotal) },
        showBank: true, watermark: i.status === 'CANCELLED' ? 'CANCELLED' : null, signatureDataUri: await signature(db),
        upiAmount: i.status === 'ISSUED' ? Math.max(0, num(i.grandTotal) - num(i.amountPaid)) : null,
      },
    };
  }
  if (kind === 'proforma') {
    const p = await db.proforma.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } }, order: { select: { number: true } } } });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    const supplier = p.supplierSnapshot as unknown as DocSupplier;
    return {
      customerId: p.customerId,
      filename: `${p.number.replace(/\//g, '-')}.pdf`,
      src: {
        title: 'PROFORMA INVOICE', numberLabel: 'Proforma No.', number: p.number, date: isoDay(p.date)!, copies: [''],
        supplier: { ...supplier, declaration: 'This is a proforma invoice for quotation / advance payment only and is not a tax invoice. Prices are valid until the date shown.' },
        consignee: p.consigneeSnapshot as unknown as DocParty, buyer: p.buyerSnapshot as unknown as DocParty, placeOfSupplyCode: p.placeOfSupply,
        refs: [['Valid until', d(p.validUntil)], ['Mode/Terms of Payment', ''], ['Reference No. & Date.', p.order?.number ?? ''], ['Other References', ''], ["Buyer's Order No.", ''], ['Dated', ''], ['', ''], ['', ''], ['', ''], ['', '']],
        termsLabel: 'Terms', terms: p.terms,
        lines: p.lines.map((l) => ({ description: l.description, hsn: l.hsnCode, qty: l.qty, unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate) })),
        stored: { taxable: num(p.taxableTotal), totalTax: num(p.taxTotal), roundOff: num(p.roundOff), total: num(p.grandTotal) },
        showBank: true, watermark: p.status === 'CANCELLED' ? 'CANCELLED' : null, signatureDataUri: await signature(db), upiAmount: num(p.grandTotal),
      },
    };
  }
  const c = await db.creditNote.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } }, invoice: { select: { number: true, date: true, consigneeSnapshot: true } } } });
  if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
  return {
    customerId: c.customerId,
    filename: `${c.number.replace(/\//g, '-')}.pdf`,
    src: {
      title: 'CREDIT NOTE', numberLabel: 'Credit Note No.', number: c.number, date: isoDay(c.date)!, copies: [''],
      supplier: c.supplierSnapshot as unknown as DocSupplier,
      consignee: (c.invoice?.consigneeSnapshot ?? c.buyerSnapshot) as unknown as DocParty, buyer: c.buyerSnapshot as unknown as DocParty, placeOfSupplyCode: c.placeOfSupply,
      refs: [['Original Invoice No.', c.invoice?.number ?? ''], ['Invoice Date', d(c.invoice?.date)], ['Reason', c.reason], ['Goods returned to stock', c.restock ? 'Yes' : 'No'], ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', '']],
      termsLabel: 'Remarks', terms: c.reason,
      lines: c.lines.map((l) => ({ description: l.description, hsn: l.hsnCode, qty: l.qty, unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate), batchNo: l.batchNo, expiryDate: isoDay(l.expiryDate), powerLabel: l.powerLabel, serialNos: l.serialNos })),
      stored: { taxable: num(c.taxableTotal), totalTax: num(c.taxTotal), roundOff: num(c.roundOff), total: num(c.grandTotal) },
      showBank: false, signatureDataUri: await signature(db),
    },
  };
}

export async function renderDocument(db: Db, kind: DocKind, id: string, copies?: InvoiceCopy[]) {
  const { src, filename, customerId } = await documentSource(db, kind, id, copies);
  const pdf = await renderDocumentPdf(await buildDocModel(src));
  return { pdf, filename, customerId };
}
