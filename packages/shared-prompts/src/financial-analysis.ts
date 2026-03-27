// Pre-computed financial analysis for listing scoring.
// Solves LLM numerical comparison errors by doing all math in code.

import type { ListingDetails } from '@repo/shared-types';

export function parseGermanNumber(raw: string | undefined): number | null {
  if (!raw) return null;

  let cleaned = raw
    .replace(/€\/?m²|€\/m2|€|EUR|Euro|m²|m2|\/m²/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!cleaned || !/\d/.test(cleaned)) return null;

  cleaned = cleaned.replace(/^ca\.?/i, '');

  // German format: dots are thousands separators, commas are decimal separators
  // Examples: "1.200" → 1200, "1.200,50" → 1200.50, "29,07" → 29.07
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  } else if (cleaned.includes('.')) {
    // Dot + exactly 3 trailing digits = thousands separator in German financial context
    const dotParts = cleaned.split('.');
    if (dotParts.length === 2 && dotParts[1].length === 3) {
      cleaned = cleaned.replace('.', '');
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

export interface QuickcheckData {
  listingPricePerSqm: number | null;
  avgLow: number | null;
  avgHigh: number | null;
  areaLow: number | null;
  areaHigh: number | null;
}

export interface BudgetComparison {
  maxWarmmiete: number;
  actualWarmmiete: number;
  difference: number; // positive = under budget, negative = over
  percentOver: number; // 0 if under, else positive %
  classification: 'under-budget' | 'slightly-over' | 'over' | 'well-over';
}

export interface IncomeRatio {
  warmmieteToIncome: number; // percentage
  classification: 'affordable' | 'stretching' | 'unaffordable';
}

export interface FinancialAnalysis {
  kaltmiete: number | null;
  warmmiete: number | null;
  nebenkosten: number | null;
  heizkosten: number | null;
  wohnflaeche: number | null;
  trueWarmmiete: number | null;
  kaltmietePerSqm: number | null;
  warmmietePerSqm: number | null;
  priceClassification: 'bargain' | 'fair' | 'overpriced' | null;
  priceClassificationSource: 'quickcheck' | 'munich-average';
  quickcheck: QuickcheckData | null;
  budgetComparison: BudgetComparison | null;
  incomeRatio: IncomeRatio | null;
  warnings: string[];
}

function coerceNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  return parseGermanNumber(value) ?? undefined;
}

export function computeFinancialAnalysis(
  details: ListingDetails,
  maxWarmmiete?: number,
  income?: string | number,
): FinancialAnalysis {
  const warnings: string[] = [];
  const incomeNum = coerceNumber(income);

  const kaltmiete = parseGermanNumber(details.kaltmiete);
  const warmmiete = parseGermanNumber(details.warmmiete);
  const nebenkosten = parseGermanNumber(details.nebenkosten);
  const wohnflaeche = parseGermanNumber(details.wohnflaeche);

  // Heizkosten: skip if "in Warmmiete/Nebenkosten enthalten"
  let heizkosten: number | null = null;
  const heizkostenRaw = details.heizkosten || '';
  if (heizkostenRaw && !/enthalten|inkl|included/i.test(heizkostenRaw)) {
    heizkosten = parseGermanNumber(details.heizkosten);
  }

  let trueWarmmiete: number | null = null;
  if (warmmiete !== null) {
    // Warmmiete typically includes Nebenkosten; add Heizkosten only if separate
    trueWarmmiete = warmmiete + (heizkosten || 0);
  } else if (kaltmiete !== null && nebenkosten !== null) {
    trueWarmmiete = kaltmiete + nebenkosten + (heizkosten || 0);
  } else if (kaltmiete !== null) {
    trueWarmmiete = kaltmiete;
    warnings.push('Nebenkosten missing — true Warmmiete may be higher');
  }

  const kaltmietePerSqm = kaltmiete !== null && wohnflaeche ? round2(kaltmiete / wohnflaeche) : null;
  const warmmietePerSqm = trueWarmmiete !== null && wohnflaeche ? round2(trueWarmmiete / wohnflaeche) : null;

  let quickcheck: QuickcheckData | null = null;
  if (details.quickcheckAvgLow || details.quickcheckAvgHigh || details.quickcheckPricePerSqm) {
    quickcheck = {
      listingPricePerSqm: parseGermanNumber(details.quickcheckPricePerSqm),
      avgLow: parseGermanNumber(details.quickcheckAvgLow),
      avgHigh: parseGermanNumber(details.quickcheckAvgHigh),
      areaLow: parseGermanNumber(details.quickcheckAreaLow),
      areaHigh: parseGermanNumber(details.quickcheckAreaHigh),
    };
  }

  let priceClassification: 'bargain' | 'fair' | 'overpriced' | null = null;
  let priceClassificationSource: 'quickcheck' | 'munich-average' = 'munich-average';

  if (kaltmietePerSqm !== null) {
    if (quickcheck && quickcheck.avgLow !== null && quickcheck.avgHigh !== null) {
      priceClassificationSource = 'quickcheck';
      if (kaltmietePerSqm < quickcheck.avgLow) {
        priceClassification = 'bargain';
      } else if (kaltmietePerSqm <= quickcheck.avgHigh) {
        priceClassification = 'fair';
      } else {
        priceClassification = 'overpriced';
      }
    } else {
      if (kaltmietePerSqm < 15) {
        priceClassification = 'bargain';
      } else if (kaltmietePerSqm <= 22) {
        priceClassification = 'fair';
      } else {
        priceClassification = 'overpriced';
      }
    }
  }

  let budgetComparison: BudgetComparison | null = null;
  if (maxWarmmiete && trueWarmmiete !== null) {
    const difference = maxWarmmiete - trueWarmmiete;
    const percentOver = difference >= 0 ? 0 : round2((-difference / maxWarmmiete) * 100);
    let classification: BudgetComparison['classification'];
    if (difference >= 0) {
      classification = 'under-budget';
    } else if (percentOver <= 10) {
      classification = 'slightly-over';
    } else if (percentOver <= 25) {
      classification = 'over';
    } else {
      classification = 'well-over';
    }
    budgetComparison = { maxWarmmiete, actualWarmmiete: trueWarmmiete, difference, percentOver, classification };
  }

  let incomeRatio: IncomeRatio | null = null;
  if (incomeNum && trueWarmmiete !== null) {
    const ratio = round2((trueWarmmiete / incomeNum) * 100);
    let classification: IncomeRatio['classification'];
    if (ratio < 33) {
      classification = 'affordable';
    } else if (ratio <= 40) {
      classification = 'stretching';
    } else {
      classification = 'unaffordable';
    }
    incomeRatio = { warmmieteToIncome: ratio, classification };
  }

  return {
    kaltmiete,
    warmmiete,
    nebenkosten,
    heizkosten,
    wohnflaeche,
    trueWarmmiete,
    kaltmietePerSqm,
    warmmietePerSqm,
    priceClassification,
    priceClassificationSource,
    quickcheck,
    budgetComparison,
    incomeRatio,
    warnings,
  };
}

export function formatFinancialAnalysis(analysis: FinancialAnalysis): string | null {
  if (
    analysis.kaltmiete === null &&
    analysis.warmmiete === null &&
    analysis.wohnflaeche === null &&
    analysis.quickcheck === null
  ) {
    return null;
  }

  const lines: string[] = ['=== PRE-COMPUTED FINANCIAL ANALYSIS (use these exact numbers, do NOT recalculate) ==='];

  const values: string[] = [];
  if (analysis.kaltmiete !== null) values.push(`Kaltmiete: ${analysis.kaltmiete}€`);
  if (analysis.trueWarmmiete !== null) values.push(`Warmmiete: ${analysis.trueWarmmiete}€`);
  if (analysis.wohnflaeche !== null) values.push(`Wohnfläche: ${analysis.wohnflaeche}m²`);
  if (values.length) lines.push(values.join(' | '));

  if (analysis.kaltmietePerSqm !== null) {
    let line = `Kaltmiete per m²: ${analysis.kaltmietePerSqm} €/m²`;
    if (analysis.priceClassification) {
      const label = analysis.priceClassification.toUpperCase();
      if (analysis.priceClassificationSource === 'quickcheck' && analysis.quickcheck) {
        line += ` → ${label} for this location (avg range: ${analysis.quickcheck.avgLow}-${analysis.quickcheck.avgHigh} €/m²)`;
      } else {
        line += ` → ${label} (Munich avg: 15-22 €/m²)`;
      }
    }
    lines.push(line);
  }
  if (analysis.warmmietePerSqm !== null) {
    lines.push(`Warmmiete per m²: ${analysis.warmmietePerSqm} €/m²`);
  }

  if (analysis.quickcheck) {
    const qc = analysis.quickcheck;
    const parts: string[] = [];
    if (qc.avgLow !== null && qc.avgHigh !== null) {
      parts.push(`avg ${qc.avgLow}-${qc.avgHigh} €/m²`);
    }
    if (qc.areaLow !== null && qc.areaHigh !== null) {
      parts.push(`full range ${qc.areaLow}-${qc.areaHigh} €/m²`);
    }
    if (parts.length) {
      lines.push(`Location price range (ImmoScout24 data for this area): ${parts.join(', ')}`);
    }
  }

  if (analysis.budgetComparison) {
    const bc = analysis.budgetComparison;
    const label =
      bc.classification === 'under-budget'
        ? `UNDER BUDGET by ${Math.abs(bc.difference)}€ (${round2((Math.abs(bc.difference) / bc.maxWarmmiete) * 100)}% under)`
        : bc.classification === 'slightly-over'
          ? `SLIGHTLY OVER BUDGET by ${Math.abs(bc.difference)}€ (${bc.percentOver}% over)`
          : bc.classification === 'over'
            ? `OVER BUDGET by ${Math.abs(bc.difference)}€ (${bc.percentOver}% over)`
            : `WELL OVER BUDGET by ${Math.abs(bc.difference)}€ (${bc.percentOver}% over)`;
    lines.push(`Budget: ${bc.actualWarmmiete}€ vs max ${bc.maxWarmmiete}€ → ${label}`);
  }

  if (analysis.incomeRatio) {
    const ir = analysis.incomeRatio;
    const label = ir.classification.toUpperCase();
    lines.push(`Income ratio: ${ir.warmmieteToIncome}% of net income → ${label}`);
  }

  if (analysis.warnings.length) {
    lines.push(`Note: ${analysis.warnings.join('; ')}`);
  }

  lines.push('=== END FINANCIAL ANALYSIS ===');
  return lines.join('\n');
}

export function formatListingWithAnalysis(
  listingText: string,
  details: ListingDetails,
  maxWarmmiete?: number,
  income?: string | number,
): string {
  const analysis = computeFinancialAnalysis(details, maxWarmmiete, income);
  const analysisText = formatFinancialAnalysis(analysis);

  if (analysisText) {
    return `${analysisText}\n\n${listingText}`;
  }
  return listingText;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
