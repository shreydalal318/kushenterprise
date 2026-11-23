import { TRPCClientError } from '@trpc/client';

/** Field errors from server-side zod validation, keyed by field name. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof TRPCClientError)) return {};
  const fe = (err.data as { zodError?: { fieldErrors?: Record<string, string[] | undefined> } } | undefined)?.zodError?.fieldErrors;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}

/** A human message for a failed call; zod issues are shown per field instead. */
export function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof TRPCClientError) {
    const zod = (err.data as { zodError?: { formErrors?: string[] } | null } | undefined)?.zodError;
    if (zod) return zod.formErrors?.[0] ?? 'Please correct the highlighted fields';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Errors under a nested object, with the prefix stripped: sub(fe, 'billingAddress') → { pincode: … }. */
export function subErrors(fe: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe)) if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
  return out;
}
