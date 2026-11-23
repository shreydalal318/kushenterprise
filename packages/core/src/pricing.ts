/**
 * Customer price resolution. Precedence (from the brief):
 *   Customer override → Customer's price list → Product default rate.
 * Overrides and list rates may carry an inclusive validity window (calendar dates, IST);
 * outside the window they are ignored and the next level applies.
 */

export type PriceSource = 'CUSTOMER' | 'PRICE_LIST' | 'DEFAULT';

export interface DatedRate {
  rate: number;
  /** "YYYY-MM-DD" or null for open-ended */
  validFrom: string | null;
  validTo: string | null;
}

export interface ResolvedPrice {
  rate: number;
  source: PriceSource;
  /** Discount (+) or premium (−) versus the default rate, in rupees and percent. */
  diff: number;
  diffPct: number;
}

/** Is a dated rate in force on `onDate` ("YYYY-MM-DD")? String compare works for ISO dates. */
export const isInForce = (r: Pick<DatedRate, 'validFrom' | 'validTo'>, onDate: string): boolean =>
  (!r.validFrom || r.validFrom <= onDate) && (!r.validTo || r.validTo >= onDate);

export function resolvePrice(
  input: { defaultRate: number; listRate?: DatedRate | null; override?: DatedRate | null },
  onDate: string,
): ResolvedPrice {
  let rate = input.defaultRate;
  let source: PriceSource = 'DEFAULT';
  if (input.override && isInForce(input.override, onDate)) {
    rate = input.override.rate;
    source = 'CUSTOMER';
  } else if (input.listRate && isInForce(input.listRate, onDate)) {
    rate = input.listRate.rate;
    source = 'PRICE_LIST';
  }
  const diff = Math.round((input.defaultRate - rate) * 100) / 100;
  const diffPct = input.defaultRate ? Math.round((diff / input.defaultRate) * 10000) / 100 : 0;
  return { rate, source, diff, diffPct };
}

/** Rate after taking `pct` percent off a base, rounded to the rupee (how special prices are quoted). */
export const percentOff = (base: number, pct: number): number => Math.round(base * (1 - pct / 100));
