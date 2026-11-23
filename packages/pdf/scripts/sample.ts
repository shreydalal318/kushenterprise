// Renders the Phase 0 sample invoice through the production template (visual regression check).
import { writeFileSync } from 'node:fs';
import { buildDocModel, closePdfBrowser, renderDocumentPdf, type DocSource } from '../src/index';

const supplier = {
  name: 'Kush Enterprise', addressLines: ['[Company Address]', '[City] - [PIN]'], phone: '[Phone]', email: '[Email]', gstin: '[GSTIN]',
  stateName: '[State Name]', stateCode: '24', pan: '[PAN]', drugLicence: '[Drug Licence No]', jurisdiction: '[City]',
  declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  bank: { holder: 'Kush Enterprise', name: '[Bank Name]', account: '[A/c No]', branchIfsc: '[Branch] & [IFSC]' }, upiId: 'kush@upi',
};
const IOL = { hsn: '90213900', gstRate: 5, unit: 'pcs' };
const lines = [
  { ...IOL, description: 'LumaVue HA-600 Hydrophobic Acrylic Foldable IOL (Monofocal)', qty: 2, rate: 3250, discPct: 0, batchNo: 'LV24113', expiryDate: '2028-08-31', powerLabel: '+21.50 D', serialNos: ['LV2411301', 'LV2411302'] },
  { ...IOL, description: 'OptiClear T-Series Toric IOL, Preloaded', qty: 1, rate: 14500, discPct: 5, batchNo: 'OCT2409', expiryDate: '2029-02-28', powerLabel: '+20.50 D / Cyl +2.25 D', serialNos: ['OCT240917'] },
  { description: 'ViscoGel Sodium Hyaluronate 1.4% OVD, 1 ml PFS', hsn: '30049099', gstRate: 5, unit: 'pcs', qty: 10, rate: 420, discPct: 0, batchNo: 'VG5521', expiryDate: '2027-06-30' },
  { description: 'PrecisaEdge Crescent Knife 2.2 mm Angled (Single Use)', hsn: '90185090', gstRate: 5, unit: 'pcs', qty: 20, rate: 180, discPct: 10, batchNo: 'PE2311', expiryDate: '2029-10-31' },
].map((l) => ({ ...l, amount: Math.round(l.qty * l.rate * (1 - l.discPct / 100) * 100) / 100 }));
const party = { name: 'Netra Jyoti Eye Hospital Pvt. Ltd.', addressLines: ['14 Lake View Road', 'Ahmedabad - 380009'], gstin: '24AAACN4521K1Z8', stateName: 'Gujarat', stateCode: '24' };
const taxable = lines.reduce((t, l) => t + l.amount, 0);
const src: DocSource = {
  title: process.argv[3] ?? 'TAX INVOICE', numberLabel: 'Invoice No.', number: 'KE/2026-27/0001', date: '2026-11-23', copies: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER'],
  supplier, consignee: { ...party, attn: 'Attn: Dr. Meera Iyer' }, buyer: party, placeOfSupplyCode: '24',
  refs: [['Delivery Note', ''], ['Mode/Terms of Payment', '30 days'], ['Reference No. & Date.', ''], ['Other References', 'KE/SO/2026-27/0004'], ["Buyer's Order No.", 'NJ/1187'], ['Dated', ''], ['Dispatch Doc No.', ''], ['Delivery Note Date', ''], ['Dispatched through', 'BlueDart'], ['Destination', 'Ahmedabad']],
  termsLabel: 'Terms of Delivery', terms: 'Door delivery', lines,
  stored: { taxable, totalTax: 0, roundOff: 0, total: 0 }, showBank: true, upiAmount: 1, watermark: process.argv[4] ?? null,
};
// Fill the stored totals the way the app does (so the consistency check passes).
const { computeGst } = await import('@kush/core');
const g = computeGst('24', '24', lines);
src.stored = { taxable: g.taxable, totalTax: g.totalTax, roundOff: g.roundOff, total: g.total };
const pdf = await renderDocumentPdf(await buildDocModel(src));
writeFileSync(process.argv[2]!, pdf);
await closePdfBrowser();
console.log('ok', pdf.length, 'bytes, total', g.total);
