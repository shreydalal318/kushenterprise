import { describe, expect, it } from 'vitest';
import { amountInWords, formatINR, integerToIndianWords, round2 } from '../src/money';
import { financialYear, financialYearRange, formatDate, formatDateTime } from '../src/dates';

describe('money', () => {
  it('rounds half away from zero', () => {
    expect(round2(1138.125)).toBe(1138.13);
    expect(round2(724.375)).toBe(724.38);
    expect(round2(-0.255)).toBe(-0.26);
  });
  it('formats with Indian grouping', () => {
    expect(formatINR(100000)).toBe('1,00,000.00');
    expect(formatINR(196202)).toBe('1,96,202.00');
    expect(formatINR(12345678.9)).toBe('1,23,45,678.90');
  });
  it('writes amounts in Indian words', () => {
    expect(amountInWords(62753)).toBe('INR Sixty Two Thousand Seven Hundred Fifty Three Only');
    expect(amountInWords(196202)).toBe('INR One Lakh Ninety Six Thousand Two Hundred Two Only');
    expect(amountInWords(2988.26)).toBe('INR Two Thousand Nine Hundred Eighty Eight and Twenty Six paise Only');
    expect(integerToIndianWords(12_34_56_789)).toBe('Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
    expect(integerToIndianWords(1_000_000_000)).toBe('One Hundred Crore');
    expect(amountInWords(0)).toBe('INR Zero Only');
  });
});

describe('dates', () => {
  it('formats DD-MM-YYYY in IST', () => {
    expect(formatDate('2026-11-23')).toBe('23-11-2026');
    // 20:00 UTC on 31 Mar is already 1 Apr in India
    expect(formatDate(new Date('2027-03-31T20:00:00Z'))).toBe('01-04-2027');
    expect(formatDateTime(new Date('2026-11-23T04:30:00Z'))).toBe('23-11-2026 10:00');
  });
  it('computes the April–March financial year', () => {
    expect(financialYear('2026-11-23')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
    expect(financialYear(new Date('2027-03-31T20:00:00Z'))).toBe('2027-28'); // IST rollover
    expect(financialYear('2099-06-01')).toBe('2099-00');
    expect(financialYearRange('2026-27')).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(() => financialYearRange('2026-28')).toThrow();
  });
});
