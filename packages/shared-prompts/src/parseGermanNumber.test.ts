import { describe, expect, it } from 'vitest';
import { parseGermanNumber } from './financial-analysis';

describe('parseGermanNumber', () => {
  it('parses simple integers', () => {
    expect(parseGermanNumber('1200')).toBe(1200);
  });

  it('parses German decimal (comma)', () => {
    expect(parseGermanNumber('29,07')).toBe(29.07);
  });

  it('parses German thousands separator (dot)', () => {
    expect(parseGermanNumber('1.200')).toBe(1200);
  });

  it('parses German thousands + decimal', () => {
    expect(parseGermanNumber('1.200,50')).toBe(1200.5);
  });

  it('strips € symbol', () => {
    expect(parseGermanNumber('1.200€')).toBe(1200);
  });

  it('strips €/m²', () => {
    expect(parseGermanNumber('14,50 €/m²')).toBe(14.5);
  });

  it('strips EUR', () => {
    expect(parseGermanNumber('EUR 800')).toBe(800);
  });

  it('strips Euro', () => {
    expect(parseGermanNumber('800 Euro')).toBe(800);
  });

  it('strips m²', () => {
    expect(parseGermanNumber('65 m²')).toBe(65);
  });

  it('strips "ca."', () => {
    expect(parseGermanNumber('ca. 70')).toBe(70);
  });

  it('strips "ca" without period', () => {
    expect(parseGermanNumber('ca75')).toBe(75);
  });

  it('handles dot as decimal for non-3-digit suffix', () => {
    // "12.5" — dot with 1 trailing digit = decimal, not thousands
    expect(parseGermanNumber('12.5')).toBe(12.5);
  });

  it('returns null for undefined', () => {
    expect(parseGermanNumber(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGermanNumber('')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseGermanNumber('nicht verfügbar')).toBeNull();
  });

  it('returns null for negative result', () => {
    expect(parseGermanNumber('-500')).toBeNull();
  });

  it('handles whitespace around value', () => {
    expect(parseGermanNumber('  950  ')).toBe(950);
  });

  it('handles "in Warmmiete enthalten" (heizkosten included)', () => {
    // This returns a number because it strips text and finds digits
    // The "enthalten" check is done in computeFinancialAnalysis, not here
    expect(parseGermanNumber('50€')).toBe(50);
  });

  it('parses complex real-world price string', () => {
    expect(parseGermanNumber('1.450,00 €')).toBe(1450);
  });
});
