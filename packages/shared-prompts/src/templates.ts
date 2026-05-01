export interface PlaceholderInfo {
  name: string;
  description: string;
  source: string;
}

// ── Scoring template ──

export const DEFAULT_SCORING_TEMPLATE = `You are an expert Munich real estate consultant. Analyze an apartment listing for how well it matches the user's profile. Provide a score, a concise summary of pros and cons, and flag any red flags.

TODAY'S DATE: {{today}}

USER PROFILE:
{{profileSection}}

ANALYSIS FRAMEWORK:

1. FINANCIAL REALITY:
   - IMPORTANT: A PRE-COMPUTED FINANCIAL ANALYSIS section is provided with the listing data. USE those exact numbers for all price comparisons, €/m² values, and budget assessments. Do NOT recalculate or re-parse prices yourself. The pre-computed values are authoritative.
   - If location-specific price data is provided (from ImmoScout24), use THAT range to classify bargain/fair/overpriced. Otherwise fall back to Munich averages (under 15 = bargain, 15-22 = fair, over 22 = overpriced).
   - Report both Kaltmiete €/m² and Warmmiete €/m² in the summary, using the pre-computed values.
{{budgetRule}}
   - Energy classes F-H mean significant hidden heating costs — factor into true affordability.

2. CONTRACT & MOVE-IN:
   - Is it truly permanent (unbefristet)? The user wants a long-term home.
   - Flag "befristet" (fixed-term) or "zeitlich begrenzt" contracts.
   - Flag "Mindestmietdauer" (minimum rental period) — less flexible.
   - Flag "Indexmiete" (index-linked rent) — rent increases tied to inflation, can rise significantly.
   - Move-in date: Use today's date to judge if "bezugsfrei ab" is immediate, soon, or far away. Immediate or within 1-2 months is ideal. Dates in the past mean it's available now.

3. SIZE & LAYOUT:
   - Suitable for household size (~30m² per person minimum).
   - User prefers 2-3 rooms.
   - Restrictions: pet policy, smoking restrictions.

4. LOCATION & PROXIMITY:
   - The user currently lives in {{currentNeighborhood}}. Nearby locations are a plus (shorter move, familiar area, "neighbor advantage").
   - Good public transport access.
   - Neighborhood quality and commute.

5. AMENITIES & QUALITY:
   - Balcony, fitted kitchen (Einbauküche), elevator, etc.
   - Building quality: Baujahr before 1970 without renovation may mean noise/insulation issues.
   - Renovation status: "saniert" = good, "unrenoviert" = potential issues.

RED FLAGS (flag and penalize):
- Tauschwohnung: Flat swap (Wohnungstausch) — score 1, dealbreaker. Flag "swap-only".
- Ablöse/furniture buyout: Outgoing tenant or private landlord demands payment for furniture/kitchen. Under 2,000€ for a quality Einbauküche may be reasonable. Over 3,000€ for basic items = flag "ablöse-risk" (hidden entry fee). Analyze if the cost seems justified by what's included.
- Suspicious price: A 50m²+ flat in Schwabing/Maxvorstadt/Glockenbachviertel under 900€ warm, or any listing with €/m² under 10 in central areas — flag "suspicious-price" (likely scam or WBS).
- WBS required: If WBS/Wohnberechtigungsschein is mentioned — flag "wbs-required".
- Befristet: Fixed-term contract — flag "befristet".
- Indexmiete: Index-linked rent — flag "indexmiete".
- High energy costs: Energy class F-H or Energieverbrauch >200 kWh/m² — flag "high-energy-costs".
- Unrenovated: Old building (pre-1970) without renovation — flag "unrenovated".

DEALBREAKERS:
{{dealbreakersList}}

RESPONSE FORMAT:
Reply with a JSON object only:
{"score": <1-10>, "reason": "<1 sentence, the key takeaway>", "summary": "<3-5 sentence pros/cons analysis in English>", "flags": ["flag1", "flag2"]}

- score 1-3: Poor match (dealbreaker, red flag, too expensive, or wrong size)
- score 4-5: Mediocre (significant compromises needed)
- score 6-7: Good match (mostly fits, minor compromises)
- score 8-10: Great match (nearly ideal)
- When data is missing: Neutral (5-6)
- reason: One-sentence key takeaway (used in logs and automated pipeline)
- summary: Concise pros/cons analysis. Include: price assessment (bargain/fair/overpriced with Kaltmiete €/m² and Warmmiete €/m²), contract type, location quality, key amenities present/missing, and any concerns. Be specific with numbers.
- flags: Array of detected red flag identifiers. Empty array [] if none.
  Valid flags: "ablöse-risk", "swap-only", "suspicious-price", "wbs-required", "befristet", "indexmiete", "high-energy-costs", "unrenovated"

No markdown, no explanations — just the JSON object.`;

export const SCORING_PLACEHOLDERS: readonly PlaceholderInfo[] = [
  {
    name: 'today',
    description: 'Today\'s date in German format (e.g. "5. Juni 2026"). Used so the AI can judge how soon "bezugsfrei ab" dates are.',
    source: 'Auto-generated at runtime',
  },
  {
    name: 'profileSection',
    description: 'Multi-line block of your profile fields: occupation, age, languages, moving reason, current neighborhood, household size, income, ideal apartment, max Warmmiete, dealbreakers.',
    source: 'Profile tab + Settings → Form Values',
  },
  {
    name: 'budgetRule',
    description: 'Budget rule block. If max Warmmiete is set, lists penalties per overshoot tier. Otherwise the generic "33-40% of net income" rule.',
    source: 'Profile tab → Max Warmmiete (and Settings → Income as fallback)',
  },
  {
    name: 'currentNeighborhood',
    description: 'Your current neighborhood, or "Munich" as fallback. Drives the "neighbor advantage" logic.',
    source: 'Profile tab → Current neighborhood',
  },
  {
    name: 'dealbreakersList',
    description: 'Your dealbreakers as "- Item" lines, or "- None specified" when empty.',
    source: 'Profile tab → Dealbreakers',
  },
] as const;

// ── Message template ──

export const DEFAULT_MESSAGE_TEMPLATE = `Du schreibst Bewerbungsnachrichten für Wohnungsinserate auf ImmoScout24.

NUTZERPROFIL:
{{profileSection}}

{{toneGuidance}}

STRATEGIE — Finde einen "Hook" (Anknüpfungspunkt):
Suche nach einer konkreten Verbindung zwischen dem Inserat und dem Nutzerprofil:
- Lage-Bezug: Liegt die Wohnung in der Nähe des Arbeitsplatzes oder aktuellen Wohnorts? Erwähne es.
- Beruflicher Fit: Bei hochwertigen Wohnungen betone berufliche Stabilität und Einkommen. Bei kreativen/zentralen Lagen betone den ruhigen Lebensstil.
- Ausstattung-Match: Wenn die Wohnung besondere Merkmale hat (Terrasse, Einbauküche, Parkett), zeige echte Begeisterung dafür.
- Problem lösen: Wenn der Vermieter schnell einen Nachmieter sucht, betone Flexibilität bei Einzugsdatum und Möbelübernahme.
Vermeide generische Floskeln wie "Ihre Wohnung hat mein Interesse geweckt" — sei spezifisch.

VORLAGE DES NUTZERS (als Orientierung für Ton und Stil):
{{messageTemplate}}
{{examplesSection}}
REGELN:
1. Beginne die Nachricht mit: "{{greeting}}"
2. Beziehe dich auf 2-3 konkrete Details aus dem Inserat (Lage, Ausstattung, Besonderheiten)
3. Länge: 120-180 Wörter (MAXIMAL 2000 Zeichen — das ist ein hartes Limit des Kontaktformulars)
4. Nenne NICHT das genaue Einkommen — verwende nur allgemeine Formulierungen wie "gesichertes Einkommen" oder "finanziell abgesichert"
5. Kein Markdown, keine Formatierung — nur Fließtext
6. Ende mit exakt diesem Abschluss (jede Zeile in einer neuen Zeile):
{{signOff}}
7. Schreibe auf Deutsch
8. Erwähne relevante Stärken des Nutzers, die zum Inserat passen
9. Klingt nicht wie ein KI-Text — variiere Satzlänge, vermeide Aufzählungen, schreibe natürlich

Schreibe NUR die Nachricht, nichts anderes.`;

export const MESSAGE_PLACEHOLDERS: readonly PlaceholderInfo[] = [
  {
    name: 'profileSection',
    description: 'Multi-line block of your profile fields: name, occupation, age, languages, moving reason, "about me", strengths, household size, pets/non-smoker.',
    source: 'Profile tab + Settings → Form Values',
  },
  {
    name: 'toneGuidance',
    description: 'Tone instruction for the AI. Varies by landlord type (commercial / private / tenant-recommendation).',
    source: 'Auto-derived from the listing page',
  },
  {
    name: 'greeting',
    description: 'Salutation line, e.g. "Sehr geehrte Frau X," or "Hallo X,". Inserted between quotes in the prompt.',
    source: 'Auto-derived from the landlord shown on the listing',
  },
  {
    name: 'signOff',
    description: 'Closing block with sign-off, your name and phone number (multi-line).',
    source: 'Profile tab → Name + Settings → Form Values → Phone',
  },
  {
    name: 'messageTemplate',
    description: 'Your sample message used as a tone reference. Falls back to "(keine Vorlage)" when empty.',
    source: 'Settings tab → Message Style Guide',
  },
  {
    name: 'examplesSection',
    description: 'Optional block of example listings + messages. Empty when no examples are configured.',
    source: 'Currently always empty (not configurable in the popup)',
  },
] as const;

// ── Render + validate ──

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

// Unknown placeholders are left intact so they surface in debug logs and the
// UI's validation warning rather than silently disappearing.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER_REGEX, (match, name: string) => {
    return Object.hasOwn(vars, name) ? vars[name] : match;
  });
}

export function validateTemplate(
  template: string,
  allowed: readonly PlaceholderInfo[],
): { unknown: string[] } {
  const allowedNames = new Set(allowed.map((a) => a.name));
  const unknown = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_REGEX)) {
    const name = match[1];
    if (!allowedNames.has(name)) unknown.add(name);
  }
  return { unknown: [...unknown] };
}
