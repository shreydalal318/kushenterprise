const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Check character for the first 14 characters of a GSTIN (GSTN mod-36 algorithm). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]!);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

/** Format + checksum validation. Returns null when valid, otherwise a reason. */
export function gstinError(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return 'GSTIN must be 15 characters like 27ABCDE1234F1Z5';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'GSTIN check digit does not match — please re-check';
  return null;
}
export const isValidGstin = (g: string) => gstinError(g) === null;

/** State code embedded in a GSTIN ("27..." -> "27"). */
export const stateCodeFromGstin = (g: string) => g.trim().slice(0, 2);
/** PAN embedded in a GSTIN (characters 3–12). */
export const panFromGstin = (g: string) => g.trim().toUpperCase().slice(2, 12);

export const isValidPan = (p: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p.trim().toUpperCase());
export const isValidPincode = (p: string) => /^[1-9][0-9]{5}$/.test(p.trim());
export const isValidIfsc = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.trim().toUpperCase());

/**
 * Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX). Accepts "98765 43210",
 * "+91-98765-43210", "09876543210". Returns null when it is not a valid Indian mobile.
 */
export function normalizeIndianMobile(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Password policy for staff accounts. Returns null when acceptable. */
export function passwordError(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number';
  return null;
}

/** GS1 mod-10 check digit over all digits except the last. */
function gs1CheckOk(digits: string): boolean {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/**
 * Validate a GTIN-8/12/13/14 (barcode on manufacturers' boxes) and normalise it to 14 digits,
 * which is how GS1 DataMatrix / GS1-128 encode it (AI 01). Returns null when invalid.
 */
export function normalizeGtin(raw: string): string | null {
  const d = raw.replace(/\s/g, '');
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(d) || !gs1CheckOk(d)) return null;
  return d.padStart(14, '0');
}

/** HSN codes are 4, 6 or 8 digits (SAC for services: 6). */
export const isValidHsn = (s: string) => /^(\d{4}|\d{6}|\d{8})$/.test(s.trim());
