import { formatINR } from '@kush/core';
export const rupees = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '-' : ''}₹${formatINR(Math.abs(n))}`);
export const newRequestId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong');
