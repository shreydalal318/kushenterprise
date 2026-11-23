import { describe, expect, it } from 'vitest';
import { isInForce, percentOff, resolvePrice } from '../src/pricing';
import { expandPowerRange, formatPower, variantLabel, variantSku } from '../src/lens';

describe('price precedence', () => {
  const list = { rate: 2900, validFrom: null, validTo: null };
  const override = { rate: 2750, validFrom: '2026-11-01', validTo: '2026-12-31' };

  it('override beats price list beats default', () => {
    expect(resolvePrice({ defaultRate: 3250 }, '2026-11-23')).toMatchObject({ rate: 3250, source: 'DEFAULT', diff: 0 });
    expect(resolvePrice({ defaultRate: 3250, listRate: list }, '2026-11-23')).toMatchObject({ rate: 2900, source: 'PRICE_LIST', diff: 350 });
    expect(resolvePrice({ defaultRate: 3250, listRate: list, override }, '2026-11-23')).toMatchObject({ rate: 2750, source: 'CUSTOMER', diff: 500, diffPct: 15.38 });
  });

  it('ignores expired or future special prices (inclusive window)', () => {
    expect(resolvePrice({ defaultRate: 3250, listRate: list, override }, '2027-01-01').source).toBe('PRICE_LIST');
    expect(resolvePrice({ defaultRate: 3250, override }, '2026-10-31').source).toBe('DEFAULT');
    expect(isInForce(override, '2026-11-01')).toBe(true);
    expect(isInForce(override, '2026-12-31')).toBe(true);
  });

  it('reports a premium as a negative difference', () => {
    expect(resolvePrice({ defaultRate: 100, override: { rate: 110, validFrom: null, validTo: null } }, '2026-01-01')).toMatchObject({ diff: -10, diffPct: -10 });
  });

  it('rounds percent-off prices to the rupee', () => {
    expect(percentOff(3250, 12.5)).toBe(2844);
  });
});

describe('lens powers', () => {
  it('formats powers and labels', () => {
    expect(formatPower(21.5)).toBe('+21.50 D');
    expect(formatPower(-2)).toBe('-2.00 D');
    expect(variantLabel({ powerSph: 20.5, cylinder: 2.25 })).toBe('+20.50 D / Cyl +2.25 D');
    expect(variantLabel({ powerSph: 23, addPower: 3.5 })).toBe('+23.00 D (Add +3.50 D)');
    expect(variantSku('OC-T300', { powerSph: 20.5, cylinder: 2.25 })).toBe('OC-T300-+20.50-C2.25');
  });

  it('expands ranges without floating-point drift', () => {
    const r = expandPowerRange({ from: 10, to: 30, step: 0.5 });
    expect(r).toHaveLength(41);
    expect(r[1]!.powerSph).toBe(10.5);
    expect(r.at(-1)!.powerSph).toBe(30);
    const quarter = expandPowerRange({ from: -2, to: 2, step: 0.25 });
    expect(quarter.map((x) => x.powerSph)).toContain(0.75);
    expect(quarter).toHaveLength(17);
  });

  it('crosses powers with cylinders for torics and enforces limits', () => {
    expect(expandPowerRange({ from: 18, to: 20, step: 1, cylinders: [1.5, 2.25, 3] })).toHaveLength(9);
    expect(() => expandPowerRange({ from: 20, to: 10, step: 0.5 })).toThrow(/greater/);
    expect(() => expandPowerRange({ from: -30, to: 30, step: 0.25, cylinders: [1, 2, 3] })).toThrow(/limit/);
  });
});
