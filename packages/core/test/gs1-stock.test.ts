import { describe, expect, it } from 'vitest';
import { gs1Date, parseGs1 } from '../src/gs1';
import { daysUntil, expiryBucket, stockStatus } from '../src/stock';

describe('GS1 parsing', () => {
  it('reads human-readable form', () => {
    expect(parseGs1('(01)08901234567890(17)280831(10)LV24113(21)LV2411301')).toEqual({
      gtin: '08901234567890', expiry: '2028-08-31', batch: 'LV24113', serial: 'LV2411301',
    });
  });
  it('reads raw strings with GS separators and symbology prefixes', () => {
    expect(parseGs1(']d201089012345678901728083110LV24113\x1d21LV2411301')).toEqual({
      gtin: '08901234567890', expiry: '2028-08-31', batch: 'LV24113', serial: 'LV2411301',
    });
    expect(parseGs1('010890123456789010LV24113~17280831')).toMatchObject({ batch: 'LV24113', expiry: '2028-08-31' });
    expect(parseGs1('0108901234567890|10B1|21S1')).toMatchObject({ batch: 'B1', serial: 'S1' });
  });
  it('treats day 00 as the last day of the month and rejects bad dates', () => {
    expect(gs1Date('280200')).toBe('2028-02-29');
    expect(gs1Date('271300')).toBeNull();
    expect(parseGs1('(01)08901234567890(17)281332')).toBeNull();
  });
  it('ignores non-GS1 codes', () => {
    expect(parseGs1('KE00000123')).toBeNull();
    expect(parseGs1('8901234567890')).toBeNull(); // plain EAN-13
    expect(parseGs1('')).toBeNull();
  });
  it('reads company-internal AI 91', () => {
    expect(parseGs1('(91)KE00000123(10)LV24113')).toEqual({ internal: 'KE00000123', batch: 'LV24113' });
  });
});

describe('stock status', () => {
  const today = '2026-11-23';
  it('applies out → low → expiring → in stock', () => {
    expect(stockStatus({ qty: 0, reorderLevel: 5 }, today, 90)).toBe('OUT_OF_STOCK');
    expect(stockStatus({ qty: 5, reorderLevel: 5, nearestExpiry: '2026-12-01' }, today, 90)).toBe('LOW_STOCK');
    expect(stockStatus({ qty: 9, reorderLevel: 5, nearestExpiry: '2027-01-15' }, today, 90)).toBe('EXPIRING_SOON');
    expect(stockStatus({ qty: 9, reorderLevel: 5, nearestExpiry: '2028-01-15' }, today, 90)).toBe('IN_STOCK');
  });
  it('buckets expiry by alert days', () => {
    expect(daysUntil('2026-12-23', today)).toBe(30);
    expect(expiryBucket('2026-11-22', today, [30, 60, 90])).toBe('Expired');
    expect(expiryBucket('2026-12-23', today, [30, 60, 90])).toBe('0–30 days');
    expect(expiryBucket('2026-12-24', today, [30, 60, 90])).toBe('31–60 days');
    expect(expiryBucket('2027-02-21', today, [30, 60, 90])).toBe('61–90 days');
    expect(expiryBucket('2027-03-01', today, [30, 60, 90])).toBeNull();
  });
});
