import { describe, expect, it } from 'vitest';
import { ageingBucket, canMoveTo, drCr, dueDateFor, paymentStatus, tallyLedgerLine } from '../src/sales';

describe('sales rules', () => {
  it('follows the order flow with hold and cancel as side states', () => {
    expect(canMoveTo('PLACED', 'CONFIRMED')).toBe(true);
    expect(canMoveTo('PLACED', 'DISPATCHED')).toBe(false);
    expect(canMoveTo('ON_HOLD', 'PACKED')).toBe(true);
    expect(canMoveTo('DISPATCHED', 'CANCELLED')).toBe(false);
    expect(canMoveTo('DELIVERED', 'PLACED')).toBe(false);
  });
  it('computes due dates, payment status and ageing', () => {
    expect(dueDateFor('2026-11-23', 30)).toBe('2026-12-23');
    const today = '2026-12-31';
    expect(paymentStatus({ total: 100, settled: 100, dueDate: '2026-12-01' }, today)).toBe('PAID');
    expect(paymentStatus({ total: 100, settled: 40, dueDate: '2026-12-01' }, today)).toBe('OVERDUE');
    expect(paymentStatus({ total: 100, settled: 40, dueDate: '2027-01-30' }, today)).toBe('PARTLY_PAID');
    expect(paymentStatus({ total: 100, settled: 0, dueDate: '2027-01-30', cancelled: true }, today)).toBe('CANCELLED');
    expect(ageingBucket('2026-12-01', today)).toBe('0–30');
    expect(ageingBucket('2026-11-01', today)).toBe('31–60');
    expect(ageingBucket('2026-10-02', today)).toBe('61–90');
    expect(ageingBucket('2026-09-01', today)).toBe('90+');
  });
});

import { suggestDispatchMethod } from '../src/sales';
describe('dispatch method suggestion', () => {
  it('suggests our own delivery staff in the same city or PIN area, a courier elsewhere', () => {
    const co = { city: 'Vadodara', pincode: '390007' };
    expect(suggestDispatchMethod(co, { addressLines: ['OT Stores', 'Alkapuri', 'Vadodara - 390005'] })).toBe('OWN_DELIVERY');
    expect(suggestDispatchMethod(co, { addressLines: ['Main Road', 'Waghodia - 391760'] })).toBe('COURIER');
    expect(suggestDispatchMethod({ city: 'Baroda', pincode: '390007' }, { addressLines: ['Sayajigunj - 390020'] })).toBe('OWN_DELIVERY');
    expect(suggestDispatchMethod(co, { addressLines: ['FC Road', 'Pune - 411004'] })).toBe('COURIER');
    expect(suggestDispatchMethod({ city: '[City]', pincode: '[PIN]' }, { addressLines: ['x - 390001'] })).toBe('COURIER');
  });
});

describe('Tally ledger lines', () => {
  it('uses To for debits and By for credits, with the voucher type', () => {
    expect(tallyLedgerLine('INVOICE')).toEqual({ particulars: 'To Sales', vchType: 'Sales' });
    expect(tallyLedgerLine('PAYMENT', 'CASH')).toEqual({ particulars: 'By Cash', vchType: 'Receipt' });
    expect(tallyLedgerLine('PAYMENT', 'UPI')).toEqual({ particulars: 'By Bank', vchType: 'Receipt' });
    expect(tallyLedgerLine('CREDIT_NOTE')).toEqual({ particulars: 'By Sales Returns', vchType: 'Credit Note' });
    expect(drCr(9773)).toBe('9,773.00 Dr');
    expect(drCr(-1200.5)).toBe('1,200.50 Cr');
  });
});
