/** Sales rules shared by API, web and mobile: order flow, due dates, payment status, ageing. */
import { formatINR } from './money';
import { addDays, daysUntil } from './stock';

export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'ON_HOLD'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'];
/**
 * What people see. The tax invoice confirms and packs an order in one go, so Placed and Confirmed are both
 * "New" and Packed is "Invoiced": four words for four steps, the same on the website and in the app.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'New', CONFIRMED: 'New', PACKED: 'Invoiced', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', ON_HOLD: 'On hold',
};
/** The same four steps in a doctor's words. */
export const CUSTOMER_ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Order placed', CONFIRMED: 'Order placed', PACKED: 'Invoice ready', DISPATCHED: 'On the way', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', ON_HOLD: 'On hold',
};
/** The four steps shown on status trackers, one status per step (Confirmed is part of New). */
export const ORDER_STEPS: OrderStatus[] = ['PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED'];
/** How far along the four steps an order is: 1 New … 4 Delivered, 0 when on hold or cancelled. */
export const orderStep = (s: OrderStatus) => ({ PLACED: 1, CONFIRMED: 1, PACKED: 2, DISPATCHED: 3, DELIVERED: 4, ON_HOLD: 0, CANCELLED: 0 })[s];

export type LedgerEntryType = 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'CANCELLED_INVOICE';
/**
 * A party ledger line the way Tally prints it: Particulars is "To" (debit) or "By" (credit) and the other
 * ledger (Sales, Bank or Cash, Sales Returns), next to the voucher type.
 */
export function tallyLedgerLine(type: LedgerEntryType, paymentMode?: string | null): { particulars: string; vchType: string } {
  if (type === 'INVOICE') return { particulars: 'To Sales', vchType: 'Sales' };
  if (type === 'CANCELLED_INVOICE') return { particulars: '(cancelled)', vchType: 'Sales' };
  if (type === 'CREDIT_NOTE') return { particulars: 'By Sales Returns', vchType: 'Credit Note' };
  return { particulars: paymentMode === 'CASH' ? 'By Cash' : 'By Bank', vchType: 'Receipt' };
}
/** Tally's balance style: "9,773.00 Dr" (the party owes us) / "1,200.00 Cr" (in their favour). */
export const drCr = (n: number) => `${formatINR(Math.abs(n))} ${n < 0 ? 'Cr' : 'Dr'}`;

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

/** How goods leave the store. */
export const DISPATCH_METHODS = ['OWN_DELIVERY', 'COURIER', 'TRANSPORT', 'PICKUP'] as const;
export type DispatchMethod = (typeof DISPATCH_METHODS)[number];
export const DISPATCH_METHOD_LABEL: Record<DispatchMethod, string> = {
  OWN_DELIVERY: 'Our delivery staff', COURIER: 'Courier', TRANSPORT: 'Transport (LR)', PICKUP: 'Customer pickup',
};

/** Same city as us (or same 3-digit PIN area) → our own delivery staff; otherwise a courier. */
export function suggestDispatchMethod(company: { city?: string | null; pincode?: string | null }, shipTo: { addressLines: string[] } | null | undefined): DispatchMethod {
  if (!shipTo) return 'COURIER';
  const text = shipTo.addressLines.join(' ').toLowerCase();
  const city = (company.city ?? '').trim().toLowerCase();
  if (city && !/^\[.*\]$/.test(city) && text.includes(city)) return 'OWN_DELIVERY';
  const pin = text.match(/\b(\d{6})\b/)?.[1];
  if (pin && company.pincode && /^\d{6}$/.test(company.pincode) && pin.slice(0, 3) === company.pincode.slice(0, 3)) return 'OWN_DELIVERY';
  return 'COURIER';
}
