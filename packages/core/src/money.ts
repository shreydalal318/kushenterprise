/** Round to 2 decimals, half away from zero (Tally behaviour). */
export const round2 = (n: number): number =>
  Math.sign(n) * (Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100);

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 112345.5 -> "1,12,345.50" (Indian digit grouping). */
export const formatINR = (n: number): string => inr.format(round2(n));

/** 112345.5 -> "₹1,12,345.50" */
export const formatRupees = (n: number): string => (n < 0 ? '-₹' : '₹') + formatINR(Math.abs(n));

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n: number): string =>
  n < 20 ? ONES[n]! : TENS[Math.floor(n / 10)]! + (n % 10 ? ' ' + ONES[n % 10] : '');

const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
};

/** Integer to words with Indian grouping: 1,23,45,678 -> "One Crore Twenty Three Lakh ...". */
export function integerToIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('integerToIndianWords expects a non-negative integer');
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  const out: string[] = [];
  if (crore) out.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) out.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) out.push(`${twoDigits(thousand)} Thousand`);
  if (rest) out.push(threeDigits(rest));
  return out.join(' ');
}

/** 112345.5 -> "INR One Lakh Twelve Thousand Three Hundred Forty Five and Fifty paise Only" */
export function amountInWords(amount: number): string {
  const negative = amount < 0;
  const paiseTotal = Math.round(round2(Math.abs(amount)) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  let s = `INR ${negative ? 'Minus ' : ''}${integerToIndianWords(rupees)}`;
  if (paise) s += ` and ${twoDigits(paise)} paise`;
  return `${s} Only`;
}
