/** Stock status rules shared by the API, web and (later) mobile app. */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON';

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  EXPIRING_SOON: 'Expiring soon',
};

/** Whole days from `today` to `date` (both "YYYY-MM-DD"); negative when already past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Status for one stock item. Out of stock beats everything; then low stock (at or below the
 * reorder level); then expiring soon (some stock expires within the alert window).
 */
export function stockStatus(i: { qty: number; reorderLevel: number; nearestExpiry?: string | null }, today: string, expiryWindowDays: number): StockStatus {
  if (i.qty <= 0) return 'OUT_OF_STOCK';
  if (i.qty <= i.reorderLevel) return 'LOW_STOCK';
  if (i.nearestExpiry && daysUntil(i.nearestExpiry, today) <= expiryWindowDays) return 'EXPIRING_SOON';
  return 'IN_STOCK';
}

/** Expiry bucket for reports: expired, 0–30, 31–60, 61–90 (using the configured alert days). */
export function expiryBucket(expiry: string, today: string, alertDays: number[]): string | null {
  const d = daysUntil(expiry, today);
  if (d < 0) return 'Expired';
  const sorted = [...alertDays].sort((a, b) => a - b);
  let prev = 0;
  for (const limit of sorted) {
    if (d <= limit) return prev === 0 ? `0–${limit} days` : `${prev + 1}–${limit} days`;
    prev = limit;
  }
  return null;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: 'Opening stock',
  GRN: 'Goods received',
  SALE: 'Sale',
  SALES_RETURN: 'Sales return',
  PURCHASE_RETURN: 'Returned to supplier',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  INVOICE_CANCEL: 'Invoice cancelled',
};

export const ADJUSTMENT_REASONS = ['DAMAGED', 'EXPIRED', 'SAMPLE', 'CORRECTION', 'LOST'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];
export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  DAMAGED: 'Damaged', EXPIRED: 'Expired', SAMPLE: 'Sample given', CORRECTION: 'Count correction', LOST: 'Lost / missing',
};
