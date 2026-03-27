// Pre-computed financial analysis for listing scoring.
// Solves LLM numerical comparison errors by doing all math in code.

import type { ListingDetails } from '@repo/shared-types';
import { formatListingForPrompt } from './index';

// ── German number parsing ──

export function parseGermanNumber(raw: string | undefined): number | null {
  if (!raw) return null;

  // Strip currency symbols, units, and whitespace
  let cleaned = raw
    .replace(/€\/?m²|€\/m2|€|EUR|Euro|m²|m2|\/m²/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!cleaned || !/\d/.test(cleaned)) return null;

  // Handle "ca." prefix (common in German listings)
  cleaned = cleaned.replace(/^ca\.?/i, '');

  // German format: dots are thousands separators, commas are decimal separators
  // Examples: "1.200" → 1200, "1.200,50" → 1200.50, "29,07" → 29.07

  if (cleaned.includes(',') && cleaned.includes('.')) {
    // "1.200,50" — dot is thousands, comma is decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // "29,07" or "1200,50" — comma is decimal
    cleaned = cleaned.replace(',', '.');
  } else if (cleaned.includes('.')) {
    // "1.200" — ambiguous. In German financial context, dot + exactly 3 trailing digits = thousands
    const dotParts = cleaned.split('.');
    if (dotParts.length === 2 && dotParts[1].length === 3) {
      // Thousands separator: "1.200" → "1200"
      cleaned = cleaned.replace('.', '');
    }
    // Otherwise treat dot as decimal: "47.67" → 47.67
  }

  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

// ── Types ──

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
  // Parsed values
  kaltmiete: number | null;
  warmmiete: number | null;
  nebenkosten: number | null;
  heizkosten: number | null;
  wohnflaeche: number | null;

  // Computed values
  trueWarmmiete: number | null;
  kaltmietePerSqm: number | null;
  warmmietePerSqm: number | null;
  priceClassification: 'bargain' | 'fair' | 'overpriced' | null;
  priceClassificationSource: 'quickcheck' | 'munich-average';

  // Location-specific data from ImmoScout
  quickcheck: QuickcheckData | null;

  // Budget comparison
  budgetComparison: BudgetComparison | null;

  // Income ratio
  incomeRatio: IncomeRatio | null;

  // Warnings about parsing issues
  warnings: string[];
}

// ── Computation ──

export function computeFinancialAnalysis(
  details: ListingDetails,
  maxWarmmiete?: number,
  income?: number,
): FinancialAnalysis {
  const warnings: string[] = [];

  // Parse raw values
  const kaltmiete = parseGermanNumber(details.kaltmiete);
  const warmmiete = parseGermanNumber(details.warmmiete);
  const nebenkosten = parseGermanNumber(details.nebenkosten);
  const wohnflaeche = parseGermanNumber(details.wohnflaeche);

  // Heizkosten: check if "in Warmmiete/Nebenkosten enthalten"
  let heizkosten: number | null = null;
  const heizkostenRaw = (details.heizkosten || '').toLowerCase();
  if (heizkostenRaw && !/enthalten|inkl|included/i.test(heizkostenRaw)) {
    heizkosten = parseGermanNumber(details.heizkosten);
  }

  // Compute true Warmmiete
  let trueWarmmiete: number | null = null;
  if (warmmiete !== null) {
    // Listing provides Warmmiete directly — use it (it typically includes Nebenkosten)
    // Add Heizkosten if separate
    trueWarmmiete = warmmiete + (heizkosten || 0);
  } else if (kaltmiete !== null && nebenkosten !== null) {
    trueWarmmiete = kaltmiete + nebenkosten + (heizkosten || 0);
  } else if (kaltmiete !== null) {
    trueWarmmiete = kaltmiete; // Best we can do
    warnings.push('Nebenkosten missing — true Warmmiete may be higher');
  }

  // €/m² calculations
  const kaltmietePerSqm = kaltmiete !== null && wohnflaeche ? round2(kaltmiete / wohnflaeche) : null;
  const warmmietePerSqm = trueWarmmiete !== null && wohnflaeche ? round2(trueWarmmiete / wohnflaeche) : null;

  // Parse quickcheck data
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

  // Price classification
  let priceClassification: 'bargain' | 'fair' | 'overpriced' | null = null;
  let priceClassificationSource: 'quickcheck' | 'munich-average' = 'munich-average';

  // Use the kaltmiete €/m² for classification (consistent with prompt instructions)
  const priceToClassify = kaltmietePerSqm;

  if (priceToClassify !== null) {
    if (quickcheck?.avgLow !== null && quickcheck?.avgHigh !== null && quickcheck) {
      // Use location-specific range from ImmoScout
      priceClassificationSource = 'quickcheck';
      if (priceToClassify < quickcheck.avgLow!) {
        priceClassification = 'bargain';
      } else if (priceToClassify <= quickcheck.avgHigh!) {
        priceClassification = 'fair';
      } else {
        priceClassification = 'overpriced';
      }
    } else {
      // Fallback: Munich average ranges
      if (priceToClassify < 15) {
        priceClassification = 'bargain';
      } else if (priceToClassify <= 22) {
        priceClassification = 'fair';
      } else {
        priceClassification = 'overpriced';
      }
    }
  }

  // Budget comparison
  let budgetComparison: BudgetComparison | null = null;
  if (maxWarmmiete && trueWarmmiete !== null) {
    const difference = maxWarmmiete - trueWarmmiete; // positive = under budget
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
    budgetComparison = {
      maxWarmmiete,
      actualWarmmiete: trueWarmmiete,
      difference,
      percentOver,
      classification,
    };
  }

  // Income ratio
  let incomeRatio: IncomeRatio | null = null;
  if (income && trueWarmmiete !== null) {
    const ratio = round2((trueWarmmiete / income) * 100);
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

// ── Formatting ──

export function formatFinancialAnalysis(analysis: FinancialAnalysis): string | null {
  // If we couldn't parse any financial data, return null (fall back to raw text only)
  if (
    analysis.kaltmiete === null &&
    analysis.warmmiete === null &&
    analysis.wohnflaeche === null &&
    analysis.quickcheck === null
  ) {
    return null;
  }

  const lines: string[] = ['=== PRE-COMPUTED FINANCIAL ANALYSIS (use these exact numbers, do NOT recalculate) ==='];

  // Parsed values
  const values: string[] = [];
  if (analysis.kaltmiete !== null) values.push(`Kaltmiete: ${analysis.kaltmiete}€`);
  if (analysis.trueWarmmiete !== null) values.push(`Warmmiete: ${analysis.trueWarmmiete}€`);
  if (analysis.wohnflaeche !== null) values.push(`Wohnfläche: ${analysis.wohnflaeche}m²`);
  if (values.length) lines.push(values.join(' | '));

  // €/m²
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

  // Quickcheck location data
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

  // Budget comparison
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

  // Income ratio
  if (analysis.incomeRatio) {
    const ir = analysis.incomeRatio;
    const label = ir.classification.toUpperCase();
    lines.push(`Income ratio: ${ir.warmmieteToIncome}% of net income → ${label}`);
  }

  // Warnings
  if (analysis.warnings.length) {
    lines.push(`Note: ${analysis.warnings.join('; ')}`);
  }

  lines.push('=== END FINANCIAL ANALYSIS ===');
  return lines.join('\n');
}

// ── Public wrapper ──

export function formatListingWithAnalysis(
  details: ListingDetails,
  maxWarmmiete?: number,
  income?: number,
): string {
  const rawText = formatListingForPrompt(details);
  const analysis = computeFinancialAnalysis(details, maxWarmmiete, income);
  const analysisText = formatFinancialAnalysis(analysis);

  if (analysisText) {
    return `${analysisText}\n\n${rawText}`;
  }
  return rawText;
}

// ── Helpers ──

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
