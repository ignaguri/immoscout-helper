import { describe, expect, it } from 'vitest';
import { computeFinancialAnalysis, formatFinancialAnalysis, formatListingWithAnalysis } from './financial-analysis';
import type { ListingDetails } from '@repo/shared-types';

function listing(overrides: Partial<ListingDetails> = {}): ListingDetails {
  return {
    kaltmiete: '900€',
    warmmiete: '1.100€',
    nebenkosten: '200€',
    wohnflaeche: '60 m²',
    ...overrides,
  };
}

describe('computeFinancialAnalysis', () => {
  it('computes basic financial values', () => {
    const result = computeFinancialAnalysis(listing());
    expect(result.kaltmiete).toBe(900);
    expect(result.warmmiete).toBe(1100);
    expect(result.nebenkosten).toBe(200);
    expect(result.wohnflaeche).toBe(60);
    expect(result.trueWarmmiete).toBe(1100);
    expect(result.kaltmietePerSqm).toBe(15);
    expect(result.warmmietePerSqm).toBeCloseTo(18.33, 1);
  });

  it('adds heizkosten to trueWarmmiete when separate', () => {
    const result = computeFinancialAnalysis(listing({ heizkosten: '80€' }));
    expect(result.heizkosten).toBe(80);
    expect(result.trueWarmmiete).toBe(1180); // 1100 + 80
  });

  it('ignores heizkosten when "in Warmmiete enthalten"', () => {
    const result = computeFinancialAnalysis(listing({ heizkosten: 'in Warmmiete enthalten' }));
    expect(result.heizkosten).toBeNull();
    expect(result.trueWarmmiete).toBe(1100);
  });

  it('ignores heizkosten when "inkl"', () => {
    const result = computeFinancialAnalysis(listing({ heizkosten: 'inkl.' }));
    expect(result.heizkosten).toBeNull();
  });

  it('computes trueWarmmiete from kaltmiete + nebenkosten when warmmiete missing', () => {
    const result = computeFinancialAnalysis(listing({ warmmiete: undefined }));
    expect(result.trueWarmmiete).toBe(1100); // 900 + 200
  });

  it('warns when nebenkosten missing and only kaltmiete available', () => {
    const result = computeFinancialAnalysis(listing({ warmmiete: undefined, nebenkosten: undefined }));
    expect(result.trueWarmmiete).toBe(900); // just kaltmiete
    expect(result.warnings).toContain('Nebenkosten missing — true Warmmiete may be higher');
  });

  // Price classification
  it('classifies bargain with Munich averages', () => {
    const result = computeFinancialAnalysis(listing({ kaltmiete: '700€', wohnflaeche: '60 m²' }));
    expect(result.kaltmietePerSqm).toBeCloseTo(11.67, 1);
    expect(result.priceClassification).toBe('bargain');
    expect(result.priceClassificationSource).toBe('munich-average');
  });

  it('classifies fair with Munich averages', () => {
    const result = computeFinancialAnalysis(listing()); // 900/60 = 15
    expect(result.priceClassification).toBe('fair');
  });

  it('classifies overpriced with Munich averages', () => {
    const result = computeFinancialAnalysis(listing({ kaltmiete: '1.400€', wohnflaeche: '60 m²' }));
    expect(result.priceClassification).toBe('overpriced');
  });

  it('uses quickcheck data when available', () => {
    const result = computeFinancialAnalysis(
      listing({
        kaltmiete: '1.200€',
        wohnflaeche: '60 m²',
        quickcheckAvgLow: '18',
        quickcheckAvgHigh: '22',
      }),
    );
    expect(result.priceClassificationSource).toBe('quickcheck');
    expect(result.kaltmietePerSqm).toBe(20);
    expect(result.priceClassification).toBe('fair');
  });

  // Budget comparison
  it('computes under-budget', () => {
    const result = computeFinancialAnalysis(listing(), 1300);
    expect(result.budgetComparison).not.toBeNull();
    expect(result.budgetComparison!.classification).toBe('under-budget');
    expect(result.budgetComparison!.difference).toBe(200);
    expect(result.budgetComparison!.percentOver).toBe(0);
  });

  it('computes slightly-over (<=10%)', () => {
    const result = computeFinancialAnalysis(listing(), 1050);
    expect(result.budgetComparison!.classification).toBe('slightly-over');
  });

  it('computes over (10-25%)', () => {
    const result = computeFinancialAnalysis(listing(), 950);
    expect(result.budgetComparison!.classification).toBe('over');
  });

  it('computes well-over (>25%)', () => {
    const result = computeFinancialAnalysis(listing(), 800);
    expect(result.budgetComparison!.classification).toBe('well-over');
  });

  it('skips budget comparison when no maxWarmmiete', () => {
    const result = computeFinancialAnalysis(listing());
    expect(result.budgetComparison).toBeNull();
  });

  // Income ratio
  it('computes affordable income ratio (<33%)', () => {
    const result = computeFinancialAnalysis(listing(), undefined, '4000');
    expect(result.incomeRatio).not.toBeNull();
    expect(result.incomeRatio!.warmmieteToIncome).toBe(27.5); // 1100/4000
    expect(result.incomeRatio!.classification).toBe('affordable');
  });

  it('computes stretching income ratio (33-40%)', () => {
    const result = computeFinancialAnalysis(listing(), undefined, '3000');
    expect(result.incomeRatio!.warmmieteToIncome).toBeCloseTo(36.67, 1);
    expect(result.incomeRatio!.classification).toBe('stretching');
  });

  it('computes unaffordable income ratio (>40%)', () => {
    const result = computeFinancialAnalysis(listing(), undefined, '2500');
    expect(result.incomeRatio!.classification).toBe('unaffordable');
  });

  it('handles all data missing gracefully', () => {
    const result = computeFinancialAnalysis({});
    expect(result.kaltmiete).toBeNull();
    expect(result.warmmiete).toBeNull();
    expect(result.trueWarmmiete).toBeNull();
    expect(result.kaltmietePerSqm).toBeNull();
    expect(result.priceClassification).toBeNull();
    expect(result.budgetComparison).toBeNull();
    expect(result.incomeRatio).toBeNull();
  });
});

describe('formatFinancialAnalysis', () => {
  it('returns null when all values are null', () => {
    const analysis = computeFinancialAnalysis({});
    expect(formatFinancialAnalysis(analysis)).toBeNull();
  });

  it('includes header and footer markers', () => {
    const analysis = computeFinancialAnalysis(listing());
    const text = formatFinancialAnalysis(analysis)!;
    expect(text).toContain('=== PRE-COMPUTED FINANCIAL ANALYSIS');
    expect(text).toContain('=== END FINANCIAL ANALYSIS ===');
  });

  it('includes per-sqm values', () => {
    const analysis = computeFinancialAnalysis(listing());
    const text = formatFinancialAnalysis(analysis)!;
    expect(text).toContain('Kaltmiete per m²: 15 €/m²');
  });

  it('includes budget comparison when present', () => {
    const analysis = computeFinancialAnalysis(listing(), 1300);
    const text = formatFinancialAnalysis(analysis)!;
    expect(text).toContain('Budget:');
    expect(text).toContain('UNDER BUDGET');
  });

  it('includes warnings', () => {
    const analysis = computeFinancialAnalysis(listing({ warmmiete: undefined, nebenkosten: undefined }));
    const text = formatFinancialAnalysis(analysis)!;
    expect(text).toContain('Note: Nebenkosten missing');
  });
});

describe('formatListingWithAnalysis', () => {
  it('prepends analysis to listing text', () => {
    const text = formatListingWithAnalysis('Titel: Test Wohnung', listing(), 1300);
    expect(text).toContain('=== PRE-COMPUTED FINANCIAL ANALYSIS');
    expect(text).toContain('Titel: Test Wohnung');
  });

  it('returns plain listing text when no analysis possible', () => {
    const text = formatListingWithAnalysis('Raw listing', {});
    expect(text).toBe('Raw listing');
  });
});
