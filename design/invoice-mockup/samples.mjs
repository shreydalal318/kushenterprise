// Sample data for the invoice mock-ups. All customer, product and brand names are fictional.
// Company details use the placeholders from the brief until real details are supplied.
// GST rates/HSN codes are illustrative and must be confirmed by the accountant (they are
// configurable per product in the app).

export const company = {
  name: 'Kush Enterprise',
  addressLines: ['[Company Address]', '[City] - [PIN]'],
  phone: '[Phone]',
  email: '[Email]',
  gstin: '[GSTIN]',
  stateName: '[State Name]',
  stateCode: 'XX', // placeholder; drives CGST+SGST vs IGST
  pan: '[PAN]',
  drugLicence: '[Drug Licence No]',
  jurisdiction: '[City]',
  bank: {
    holder: 'Kush Enterprise',
    name: '[Bank Name]',
    account: '[A/c No]',
    branchIfsc: '[Branch] & [IFSC]',
  },
  upiId: '[UPI ID]',
  declaration:
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. ' +
    'Goods once sold will not be taken back except as per company return policy. Interest @ 18% p.a. will be charged on bills unpaid beyond the due date.',
};

const IOL = { hsn: '90213900', gstRate: 5, per: 'pcs' };
const INSTR = { hsn: '90185090', gstRate: 5, per: 'pcs' };
const OVD = { hsn: '30049099', gstRate: 5, per: 'pcs' };

// ---------- Sample 1: intra-state (CGST + SGST), single page ----------
export const sampleIntra = {
  file: 'sample-1-tax-invoice-intra-state',
  title: 'TAX INVOICE',
  copies: ['original'],
  supplier: company,
  number: 'KE/2026-27/0148',
  date: '2026-11-23',
  deliveryNote: 'DN/0148',
  paymentTerms: '30 Days Credit',
  referenceNo: 'KE/PI/2026-27/0061 dt. 20-11-2026',
  otherReferences: 'Order SO-2026-00412',
  buyersOrderNo: 'NJ/PUR/1187',
  buyersOrderDate: '19-11-2026',
  dispatchDocNo: 'BD-77812430',
  deliveryNoteDate: '23-11-2026',
  dispatchedThrough: 'BlueDart Express',
  destination: '[City]',
  termsOfDelivery: 'Door delivery. Cold-chain not required. Deliver to OT Stores, 2nd Floor.',
  consignee: {
    name: 'Netra Jyoti Eye Hospital Pvt. Ltd.',
    attn: 'Attn: Dr. Meera Iyer (Cataract & Refractive)',
    addressLines: ['OT Stores, 2nd Floor, 14 Lake View Road', '[City] - [PIN]'],
    gstin: 'XXAAACN4521K1Z8',
    stateName: '[State Name]',
    stateCode: 'XX',
  },
  buyer: {
    name: 'Netra Jyoti Eye Hospital Pvt. Ltd.',
    addressLines: ['Accounts Dept., 14 Lake View Road', '[City] - [PIN]'],
    gstin: 'XXAAACN4521K1Z8',
    stateName: '[State Name]',
    stateCode: 'XX',
    drugLicence: 'DL-20B/45127, 21B/45128',
  },
  placeOfSupply: { stateName: '[State Name]', stateCode: 'XX' },
  lines: [
    { ...IOL, description: 'LumaVue HA-600 Hydrophobic Acrylic Foldable IOL (Monofocal)', qty: 2, rate: 3250, discPct: 0,
      meta: { batch: 'LV24113', expiry: '2028-08-31', power: '+21.50 D', serials: ['LV2411301', 'LV2411302'] } },
    { ...IOL, description: 'LumaVue HA-600 Hydrophobic Acrylic Foldable IOL (Monofocal)', qty: 1, rate: 3250, discPct: 0,
      meta: { batch: 'LV24113', expiry: '2028-08-31', power: '+22.00 D', serials: ['LV2411344'] } },
    { ...IOL, description: 'OptiClear T-Series Toric IOL, Preloaded', qty: 1, rate: 14500, discPct: 5,
      meta: { batch: 'OCT2409', expiry: '2029-02-28', power: '+20.50 D / Cyl +2.25 D', serials: ['OCT240917'] } },
    { ...IOL, description: 'OptiClear TriVision Trifocal IOL', qty: 1, rate: 22000, discPct: 0,
      meta: { batch: 'OCM2407', expiry: '2028-12-31', power: '+23.00 D (Add +3.50 D)', serials: ['OCM240703'] } },
    { ...OVD, description: 'ViscoGel Sodium Hyaluronate 1.4% OVD, 1 ml PFS', qty: 10, rate: 420, discPct: 0,
      meta: { batch: 'VG5521', expiry: '2027-06-30' } },
    { ...INSTR, description: 'PrecisaEdge Crescent Knife 2.2 mm Angled (Single Use)', qty: 20, rate: 180, discPct: 10,
      meta: { batch: 'PE2311', expiry: '2029-10-31' } },
    { ...INSTR, description: 'Titanium Capsulorhexis Forceps, Utrata Type', qty: 1, rate: 6800, discPct: 0,
      meta: { serials: ['TI-CF-00921'] } },
  ],
};

// ---------- Sample 2: inter-state (IGST), runs onto a second page ----------
const powers = ['+16.00', '+17.00', '+18.00', '+18.50', '+19.00', '+19.50', '+20.00', '+20.50', '+21.00',
  '+21.50', '+22.00', '+22.50', '+23.00', '+23.50', '+24.00', '+25.00'];
const qtys = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 4, 3, 3, 2, 1, 1];
let serialSeq = 4100;
const lensLines = powers.map((p, i) => ({
  ...IOL,
  description: 'LumaVue HA-600 Hydrophobic Acrylic Foldable IOL (Monofocal)',
  qty: qtys[i],
  rate: 2950,
  discPct: 0,
  meta: {
    batch: i < 8 ? 'LV24113' : 'LV24129',
    expiry: i < 8 ? '2028-08-31' : '2029-01-31',
    power: `${p} D`,
    serials: Array.from({ length: qtys[i] }, () => `LV24${serialSeq++}`),
  },
}));

export const sampleInter = {
  file: 'sample-2-tax-invoice-inter-state-multipage',
  title: 'TAX INVOICE',
  copies: ['original'],
  supplier: company,
  number: 'KE/2026-27/0149',
  date: '2026-11-23',
  deliveryNote: 'DN/0149',
  paymentTerms: '45 Days Credit',
  referenceNo: '',
  otherReferences: 'Order SO-2026-00418 (Partial dispatch 1 of 2)',
  buyersOrderNo: 'SKH/ST/2026/889',
  buyersOrderDate: '15-11-2026',
  dispatchDocNo: 'LR 55120',
  deliveryNoteDate: '23-11-2026',
  dispatchedThrough: 'VRL Logistics, KA-01-AB-4521',
  destination: 'Bengaluru',
  termsOfDelivery: 'Ex-godown. Freight paid by supplier.',
  consignee: {
    name: 'Sankara Kiran Hospital Trust',
    attn: 'Attn: Central Pharmacy / Dr. Arvind Rao',
    addressLines: ['No. 21, 4th Cross, Jayanagar 7th Block', 'Bengaluru - 560082'],
    gstin: '29AABTS7712M1ZQ',
    stateName: 'Karnataka',
    stateCode: '29',
  },
  buyer: {
    name: 'Sankara Kiran Hospital Trust',
    addressLines: ['No. 21, 4th Cross, Jayanagar 7th Block', 'Bengaluru - 560082'],
    gstin: '29AABTS7712M1ZQ',
    stateName: 'Karnataka',
    stateCode: '29',
    drugLicence: 'KA-B21-118734',
  },
  placeOfSupply: { stateName: 'Karnataka', stateCode: '29' },
  lines: [
    ...lensLines,
    { ...IOL, description: 'OptiClear T-Series Toric IOL, Preloaded', qty: 2, rate: 13800, discPct: 3,
      meta: { batch: 'OCT2409', expiry: '2029-02-28', power: '+21.00 D / Cyl +1.50 D', serials: ['OCT240931', 'OCT240932'] } },
    { ...OVD, description: 'ViscoGel Sodium Hyaluronate 1.4% OVD, 1 ml PFS', qty: 40, rate: 395, discPct: 0,
      meta: { batch: 'VG5521', expiry: '2027-06-30' } },
    { ...INSTR, description: 'PrecisaEdge Main Port Keratome 2.8 mm (Single Use)', qty: 50, rate: 165, discPct: 5,
      meta: { batch: 'PE2318', expiry: '2029-11-30' } },
    { ...INSTR, description: 'PrecisaEdge Side Port Knife 15° (Single Use)', qty: 50, rate: 140, discPct: 5,
      meta: { batch: 'PE2320', expiry: '2029-11-30' } },
  ],
};
