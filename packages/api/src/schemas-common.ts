/** Primitives shared by every schema module (kept separate to avoid circular imports). */
import { z } from 'zod';
import { INDIAN_STATES, normalizeIndianMobile, passwordError } from '@kush/core';

export const stateCodeSchema = z.string().refine((c) => INDIAN_STATES.some((s) => s.code === c), 'Choose a state');

export const mobileSchema = z.string().trim().transform((v, ctx) => {
  const n = normalizeIndianMobile(v);
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' });
    return z.NEVER;
  }
  return n;
});

export const passwordSchema = z.string().superRefine((pw, ctx) => {
  const err = passwordError(pw);
  if (err) ctx.addIssue({ code: 'custom', message: err });
});

