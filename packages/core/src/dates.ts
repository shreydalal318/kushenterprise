export const TIMEZONE = 'Asia/Kolkata';

function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') };
}

/** Date -> "DD-MM-YYYY" in Asia/Kolkata. A bare "YYYY-MM-DD" string is treated as a calendar date. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  }
  const p = istParts(new Date(d));
  return `${p.day}-${p.month}-${p.year}`;
}

/** Date -> "DD-MM-YYYY HH:mm" in Asia/Kolkata. */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const p = istParts(new Date(d));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** Calendar date (YYYY-MM-DD) of an instant, in Asia/Kolkata. */
export function istDateString(d: Date = new Date()): string {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Indian financial year (April–March) label for a date, e.g. 2026-11-23 -> "2026-27",
 * 2027-03-31 -> "2026-27", 2027-04-01 -> "2027-28". Uses the Asia/Kolkata calendar date.
 */
export function financialYear(d: Date | string = new Date()): string {
  const iso = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : istDateString(new Date(d));
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** "2026-27" -> { start: "2026-04-01", end: "2027-03-31" } */
export function financialYearRange(fy: string): { start: string; end: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) throw new RangeError(`Invalid financial year "${fy}"`);
  const start = Number(m[1]);
  if ((start + 1) % 100 !== Number(m[2])) throw new RangeError(`Invalid financial year "${fy}"`);
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` };
}
