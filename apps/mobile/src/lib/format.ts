import { formatINR } from '@kush/core';
export const rupees = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '-' : ''}₹${formatINR(Math.abs(n))}`);
export const newRequestId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
// No connection, or a reply that isn't the API's (a proxy page, the server still starting up).
const UNREACHABLE = /failed to fetch|network request failed|networkerror|load failed|timed? ?out|unexpected token|not valid json|json parse/i;

type ErrorData = { code?: string; zodError?: { formErrors?: string[]; fieldErrors?: Record<string, string | string[] | undefined> } | null };
const messageOf = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '');
const dataOf = (e: unknown) => (e && typeof e === 'object' && 'data' in e ? ((e as { data?: ErrorData | null }).data ?? null) : null);

/** The server never answered (no signal, timeout, a proxy page): a resend could fix it. */
export const isUnreachable = (e: unknown) => { const msg = messageOf(e); return !dataOf(e) && (!msg || UNREACHABLE.test(msg)); };
/** The tRPC error code from the server (UNAUTHORIZED, NOT_FOUND…), if it answered. */
export const errorCode = (e: unknown) => dataOf(e)?.code;

/** Text for an error: the server's own message, or a plain one when the server couldn't be reached. */
export const errorText = (e: unknown) => {
  if (isUnreachable(e)) return 'Can’t reach Kush Enterprise right now. Check your internet connection and try again.';
  // Validation failures arrive with the issues as JSON in `message`; show the first one instead.
  const zod = dataOf(e)?.zodError;
  if (zod) {
    const first = zod.formErrors?.[0] ?? Object.values(zod.fieldErrors ?? {}).flat().find(Boolean);
    return first || 'Please check what you entered and try again.';
  }
  return messageOf(e) || 'Something went wrong. Please try again.';
};
