/** Sales rules shared by API, web and mobile: order flow, due dates, payment status, ageing. */
import { addDays, daysUntil } from './stock';

export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'ON_HOLD'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PACKED: 'Packed', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', ON_HOLD: 'On hold',
};

/** Allowed next statuses. On hold can resume to any open step; delivered and cancelled are final. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'ON_HOLD', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'ON_HOLD', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  ON_HOLD: ['PLACED', 'CONFIRMED', 'PACKED', 'CANCELLED'],
};
export const nextStatuses = (s: OrderStatus): OrderStatus[] => NEXT[s];
export const canMoveTo = (from: OrderStatus, to: OrderStatus) => NEXT[from].includes(to);

/** Pending orders first in staff lists. */
export const ORDER_SORT_RANK: Record<OrderStatus, number> = { PLACED: 0, ON_HOLD: 1, CONFIRMED: 2, PACKED: 3, DISPATCHED: 4, DELIVERED: 5, CANCELLED: 6 };

export const dueDateFor = (invoiceDate: string, termsDays: number) => addDays(invoiceDate, Math.max(0, termsDays));

export type PaymentStatus = 'PAID' | 'PARTLY_PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED';
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { PAID: 'Paid', PARTLY_PAID: 'Part paid', UNPAID: 'Unpaid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' };

export function paymentStatus(i: { total: number; settled: number; dueDate: string; cancelled?: boolean }, today: string): PaymentStatus {
  if (i.cancelled) return 'CANCELLED';
  const due = Math.round((i.total - i.settled) * 100) / 100;
  if (due <= 0) return 'PAID';
  if (daysUntil(i.dueDate, today) < 0) return 'OVERDUE';
  return i.settled > 0 ? 'PARTLY_PAID' : 'UNPAID';
}

/** Receivables ageing by days since the invoice date: 0–30, 31–60, 61–90, 90+. */
export const AGEING_BUCKETS = ['0–30', '31–60', '61–90', '90+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export function ageingBucket(invoiceDate: string, today: string): AgeingBucket {
  const age = -daysUntil(invoiceDate, today);
  return age <= 30 ? '0–30' : age <= 60 ? '31–60' : age <= 90 ? '61–90' : '90+';
}

export const PAYMENT_MODES = ['CASH', 'UPI', 'NEFT_RTGS', 'CHEQUE', 'CARD', 'OTHER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', NEFT_RTGS: 'NEFT / RTGS', CHEQUE: 'Cheque', CARD: 'Card', OTHER: 'Other' };

export const INVOICE_COPIES = ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'] as const;
export type InvoiceCopy = (typeof INVOICE_COPIES)[number];
export const INVOICE_COPY_LABEL: Record<InvoiceCopy, string> = {
  ORIGINAL: 'ORIGINAL FOR RECIPIENT', DUPLICATE: 'DUPLICATE FOR TRANSPORTER', TRIPLICATE: 'TRIPLICATE FOR SUPPLIER',
};
