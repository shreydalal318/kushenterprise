import type { Tone } from './bits';

/** Plain words for the server's codes, shared by the office screens. */
export const LEAD_STATUS: Record<string, [string, Tone]> = { NEW: ['New', 'warn'], CONTACTED: ['Contacted', 'teal'], CONVERTED: ['Customer', 'ok'], CLOSED: ['Closed', 'neutral'] };
export const LEAD_TYPE: Record<string, string> = { HOSPITAL: 'Hospital', CLINIC: 'Clinic', DOCTOR: 'Doctor' };
export const PRICE_SOURCE: Record<string, [string, Tone]> = { CUSTOMER: ['Special price', 'teal'], PRICE_LIST: ['Price list', 'ok'], DEFAULT: ['Normal rate', 'neutral'] };
export const PRICE_SCOPE: Record<string, string> = { DEFAULT: 'Normal rate', MRP: 'MRP', COST: 'Cost', PRICE_LIST: 'Price list', CUSTOMER: 'Special price' };
/** "12.5%" or "—". */
export const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : `${Math.round(n * 10) / 10}%`);
