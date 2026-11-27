import { errorText } from '@/lib/format';

type ZodSummary = { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | null | undefined;

/** errorText, except a rejected field reads as its own message ("Who received it?") instead of raw validation JSON. */
export function readableError(e: unknown) {
  const z = (e as { data?: { zodError?: ZodSummary } } | null)?.data?.zodError;
  return z?.formErrors?.[0] ?? Object.values(z?.fieldErrors ?? {}).find((m) => m?.length)?.[0] ?? errorText(e);
}
