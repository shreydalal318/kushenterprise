// Pure calculation + formatting helpers for GST invoices.
// These are written so they can be lifted straight into the app's shared package later.

/** Round to 2 decimals using "round half away from zero" (what Tally does). */
export const round2 = (n) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 112345.5 -> "1,12,345.50" (Indian digit grouping). */
export const fmtINR = (n) => inr.format(round2(n));

/** Date -> DD-MM-YYYY (Asia/Kolkata). Accepts "YYYY-MM-DD" strings too. */
export function fmtDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date(d));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/** Financial year label for a date: 2026-11-23 -> "2026-27" (April–March). */
export function financialYear(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// ---------- Amount in words, Indian numbering (lakh / crore) ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
function integerToIndianWords(n) {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  const out = [];
  if (crore) out.push(integerToIndianWords(crore) + ' Crore'); // supports > 99 crore
  if (lakh) out.push(twoDigits(lakh) + ' Lakh');
  if (thousand) out.push(twoDigits(thousand) + ' Thousand');
  if (rest) out.push(threeDigits(rest));
  return out.join(' ');
}
/** 112345.5 -> "INR One Lakh Twelve Thousand Three Hundred Forty Five and Fifty paise Only" */
export function amountInWords(amount) {
  const paiseTotal = Math.round(round2(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  let s = 'INR ' + integerToIndianWords(rupees);
  if (paise) s += ' and ' + twoDigits(paise) + ' paise';
  return s + ' Only';
}

// ---------- GST computation ----------
/**
 * Compute line amounts, tax ledger lines, HSN summary and totals.
 * Tax is computed per HSN+rate group on the taxable value (Tally behaviour),
 * not per line, so the HSN summary always reconciles with the tax lines.
 */
export function computeInvoice(inv) {
  const interState = inv.supplier.stateCode !== inv.placeOfSupply.stateCode;
  const lines = inv.lines.map((l, i) => {
    const gross = l.qty * l.rate;
    const amount = round2(gross * (1 - (l.discPct || 0) / 100));
    return { ...l, sl: i + 1, amount };
  });

  const hsnMap = new Map();
  for (const l of lines) {
    const key = `${l.hsn}|${l.gstRate}`;
    const g = hsnMap.get(key) || { hsn: l.hsn, gstRate: l.gstRate, taxable: 0 };
    g.taxable = round2(g.taxable + l.amount);
    hsnMap.set(key, g);
  }
  const hsnSummary = [...hsnMap.values()].map((g) => {
    if (interState) {
      const igst = round2((g.taxable * g.gstRate) / 100);
      return { ...g, igstRate: g.gstRate, igst, totalTax: igst };
    }
    const half = g.gstRate / 2;
    const cgst = round2((g.taxable * half) / 100);
    const sgst = round2((g.taxable * half) / 100);
    return { ...g, cgstRate: half, cgst, sgstRate: half, sgst, totalTax: round2(cgst + sgst) };
  });

  // Tax ledger lines printed under the items, grouped by rate (e.g. "CGST @ 2.5%").
  const byRate = new Map();
  for (const h of hsnSummary) {
    const r = byRate.get(h.gstRate) || { rate: h.gstRate, cgst: 0, sgst: 0, igst: 0 };
    r.cgst = round2(r.cgst + (h.cgst || 0));
    r.sgst = round2(r.sgst + (h.sgst || 0));
    r.igst = round2(r.igst + (h.igst || 0));
    byRate.set(h.gstRate, r);
  }
  const taxLines = [];
  for (const r of [...byRate.values()].sort((a, b) => a.rate - b.rate)) {
    if (interState) taxLines.push({ label: 'IGST', rate: r.rate, amount: r.igst });
    else {
      taxLines.push({ label: 'CGST', rate: r.rate / 2, amount: r.cgst });
      taxLines.push({ label: 'SGST', rate: r.rate / 2, amount: r.sgst });
    }
  }

  const taxable = round2(lines.reduce((s, l) => s + l.amount, 0));
  const totalTax = round2(hsnSummary.reduce((s, h) => s + h.totalTax, 0));
  const beforeRound = round2(taxable + totalTax);
  const total = Math.round(beforeRound);
  const roundOff = round2(total - beforeRound);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const hsnTotals = {
    taxable,
    cgst: round2(hsnSummary.reduce((s, h) => s + (h.cgst || 0), 0)),
    sgst: round2(hsnSummary.reduce((s, h) => s + (h.sgst || 0), 0)),
    igst: round2(hsnSummary.reduce((s, h) => s + (h.igst || 0), 0)),
    totalTax,
  };

  return {
    ...inv,
    interState,
    lines,
    taxLines,
    hsnSummary,
    hsnTotals,
    taxable,
    totalTax,
    roundOff,
    total,
    totalQty,
    totalInWords: amountInWords(total),
    taxInWords: amountInWords(totalTax),
  };
}
