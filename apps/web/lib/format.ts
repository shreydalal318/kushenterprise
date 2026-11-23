import { formatRupees } from '@kush/core';

/** "₹1,23,456.00" ("-₹500.00" when negative); dash for null/undefined. */
export const rupees = (n: number | null | undefined) => (n == null ? '—' : formatRupees(n));
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
