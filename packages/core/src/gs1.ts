/**
 * GS1 barcode parsing (GS1-128, GS1 DataMatrix, GS1 QR) as delivered by USB/Bluetooth scanners
 * in keyboard-wedge mode or by camera decoders.
 *
 * Supported application identifiers (AIs):
 *   01 GTIN (14)   10 batch/lot (var ≤20)   11 production date (YYMMDD)   17 expiry (YYMMDD)
 *   21 serial (var ≤20)   30 count (var ≤8)   91 company internal (var ≤90)
 *
 * Input forms handled:
 *   - Human-readable:            (01)08901234567890(17)280831(10)LV24113(21)LV2411301
 *   - Raw with GS separators:    0108901234567890172808311 0LV24113<GS>21LV2411301
 *   - Symbology prefix:          ]d2…  ]C1…  ]Q3…  (stripped)
 *   - Separator substitutes:     GS (\x1d), "~", "|", "{GS}" (scanners are often configured to send one of these)
 */

export interface Gs1Data {
  gtin?: string;
  batch?: string;
  expiry?: string; // YYYY-MM-DD
  prodDate?: string; // YYYY-MM-DD
  serial?: string;
  count?: number;
  internal?: string; // AI 91
}

const FIXED: Record<string, number> = { '01': 14, '11': 6, '17': 6 };
const VARIABLE: Record<string, number> = { '10': 20, '21': 20, '30': 8, '91': 90 };
const KNOWN = [...Object.keys(FIXED), ...Object.keys(VARIABLE)];
const GS = '\x1d';

/** YYMMDD → YYYY-MM-DD. DD = 00 means the last day of the month (GS1 rule). Years 00–49 → 20xx. */
export function gs1Date(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd === 0) dd = last;
  if (dd > last) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function normalise(raw: string): string {
  return raw
    .trim()
    .replace(/^\](d2|C1|Q3|e0|d1)/, '')
    .replace(/\{GS\}|<GS>|~|\|/g, GS)
    .replace(/\r|\n/g, '');
}

function assign(out: Gs1Data, ai: string, value: string): boolean {
  switch (ai) {
    case '01': if (!/^\d{14}$/.test(value)) return false; out.gtin = value; return true;
    case '17': { const d = gs1Date(value); if (!d) return false; out.expiry = d; return true; }
    case '11': { const d = gs1Date(value); if (!d) return false; out.prodDate = d; return true; }
    case '10': out.batch = value; return true;
    case '21': out.serial = value; return true;
    case '30': if (!/^\d+$/.test(value)) return false; out.count = Number(value); return true;
    case '91': out.internal = value; return true;
    default: return false;
  }
}

/** Parse a GS1 element string. Returns null when the input is not GS1 (e.g. a plain EAN or our Code 128). */
export function parseGs1(raw: string): Gs1Data | null {
  const s = normalise(raw);
  if (!s) return null;

  // Human-readable "(AI)value" form
  if (s.startsWith('(')) {
    const out: Gs1Data = {};
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    let any = false;
    while ((m = re.exec(s))) {
      if (!assign(out, m[1]!, m[2]!.replace(new RegExp(GS, 'g'), '').trim())) return null;
      any = true;
    }
    return any ? out : null;
  }

  // Raw form: must start with a known AI and contain at least a GTIN or internal code
  if (!KNOWN.some((ai) => s.startsWith(ai))) return null;
  const out: Gs1Data = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const ai = s.slice(i, i + 2);
    i += 2;
    if (FIXED[ai]) {
      const v = s.slice(i, i + FIXED[ai]);
      if (v.length !== FIXED[ai] || !assign(out, ai, v)) return null;
      i += FIXED[ai];
    } else if (VARIABLE[ai]) {
      let end = s.indexOf(GS, i);
      if (end === -1) end = s.length;
      end = Math.min(end, i + VARIABLE[ai]);
      if (end <= i || !assign(out, ai, s.slice(i, end))) return null;
      i = end;
    } else {
      return null;
    }
  }
  return out.gtin || out.internal ? out : null;
}

/** Human-readable form, e.g. for printing under a 2D code. */
export const gs1Readable = (d: Gs1Data) =>
  [d.gtin && `(01)${d.gtin}`, d.expiry && `(17)${d.expiry.slice(2, 4)}${d.expiry.slice(5, 7)}${d.expiry.slice(8, 10)}`, d.batch && `(10)${d.batch}`, d.serial && `(21)${d.serial}`, d.internal && `(91)${d.internal}`]
    .filter(Boolean).join('');
