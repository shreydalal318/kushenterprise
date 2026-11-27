import { formatINR } from '@kush/core';
export const rupees = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '-' : ''}₹${formatINR(Math.abs(n))}`);
export const newRequestId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
// No connection, or a reply that isn't the API's (a proxy page, the server still starting up).
const UNREACHABLE = /failed to fetch|network request failed|networkerror|load failed|timed? ?out|unexpected token|not valid json|json parse/i;

/** Text for an error: the server's own message, or a plain one when the server couldn't be reached. */
export const errorText = (e: unknown) => {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
  const fromServer = !!(e && typeof e === 'object' && 'data' in e && (e as { data?: unknown }).data);
  if (!fromServer && (!msg || UNREACHABLE.test(msg))) return 'Can’t reach Kush Enterprise right now. Check your internet connection and try again.';
  return msg || 'Something went wrong. Please try again.';
};
