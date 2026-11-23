import { describe, expect, it } from 'vitest';
import { computeGst, taxTypeFor } from '../src/gst';

const IOL = { hsn: '90213900', gstRate: 5 };
const INSTR = { hsn: '90185090', gstRate: 5 };
const OVD = { hsn: '30049099', gstRate: 5 };

// Same lines as the approved mock-up (sample 1).
const sample1 = [
  { ...IOL, qty: 2, rate: 3250 },
  { ...IOL, qty: 1, rate: 3250 },
  { ...IOL, qty: 1, rate: 14500, discPct: 5 },
  { ...IOL, qty: 1, rate: 22000 },
  { ...OVD, qty: 10, rate: 420 },
  { ...INSTR, qty: 20, rate: 180, discPct: 10 },
  { ...INSTR, qty: 1, rate: 6800 },
];

describe('GST', () => {
  it('chooses CGST+SGST vs IGST by state', () => {
    expect(taxTypeFor('24', '24')).toBe('INTRA_STATE');
    expect(taxTypeFor('24', '29')).toBe('INTER_STATE');
  });

  it('matches the approved intra-state mock-up', () => {
    const r = computeGst('24', '24', sample1);
    expect(r.taxable).toBe(59765);
    expect(r.hsnSummary.map((h) => [h.hsn, h.taxable, h.cgst, h.sgst])).toEqual([
      ['90213900', 45525, 1138.13, 1138.13],
      ['30049099', 4200, 105, 105],
      ['90185090', 10040, 251, 251],
    ]);
    expect(r.taxLines).toEqual([
      { label: 'CGST', rate: 2.5, amount: 1494.13 },
      { label: 'SGST', rate: 2.5, amount: 1494.13 },
    ]);
    expect(r.totalTax).toBe(2988.26);
    expect(r.roundOff).toBe(-0.26);
    expect(r.total).toBe(62753);
    expect(r.totalQty).toBe(36);
  });

  it('uses IGST inter-state and splits tax lines per rate', () => {
    const r = computeGst('24', '29', [
      { hsn: 'A', gstRate: 5, qty: 1, rate: 1000 },
      { hsn: 'B', gstRate: 12, qty: 1, rate: 999.99 },
    ]);
    expect(r.taxType).toBe('INTER_STATE');
    expect(r.taxLines).toEqual([
      { label: 'IGST', rate: 5, amount: 50 },
      { label: 'IGST', rate: 12, amount: 120 },
    ]);
    expect(r.cgst + r.sgst).toBe(0);
    expect(r.total).toBe(2170); // 1999.99 + 170 = 2169.99 -> 2170
    expect(r.roundOff).toBe(0.01);
  });
});
