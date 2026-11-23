import { formatINR } from '@kush/core';

/** "₹1,23,456.00"; dash for null/undefined. */
export const rupees = (n: number | null | undefined) => (n == null ? '—' : `₹${formatINR(n)}`);
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
