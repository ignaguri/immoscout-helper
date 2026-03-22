import type { Example, LandlordInfo, Profile, UserProfile } from './types.js';

export function buildScoringPrompt(userProfile: UserProfile, profile?: Profile, _examples?: Example[]): string {
  const p = profile || {};
  const profileSection = [
    p.occupation ? `Beruf: ${p.occupation}` : null,
    p.age ? `Alter: ${p.age}` : null,
    p.languages?.length ? `Sprachen: ${p.languages.join(', ')}` : null,
    p.movingReason ? `Umzugsgrund: ${p.movingReason}` : null,
    p.currentNeighborhood ? `Aktuelles Viertel: ${p.currentNeighborhood}` : null,
    userProfile.adults ? `Erwachsene im Haushalt: ${userProfile.adults}` : null,
    userProfile.children ? `Kinder: ${userProfile.children}` : null,
    userProfile.pets && userProfile.pets !== 'Nein' ? `Haustiere: Ja` : `Haustiere: Nein`,
    userProfile.income ? `Netto-Haushaltseinkommen: ${userProfile.income}€` : null,
    userProfile.incomeRange ? `Einkommensbereich: ${userProfile.incomeRange}` : null,
    p.idealApartment ? `Idealwohnung: ${p.idealApartment}` : null,
    p.maxWarmmiete ? `Maximale Warmmiete: ${p.maxWarmmiete}€` : null,
    p.dealbreakers?.length ? `Ausschlusskriterien: ${p.dealbreakers.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const today = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

  const budgetRule = p.maxWarmmiete
    ? `   - BUDGET LIMIT: The user's maximum Warmmiete is ${p.maxWarmmiete}€. Listings above this budget should be penalized significantly:
     • Up to 10% over budget: score -2 penalty, note "slightly over budget"
     • 10-25% over budget: score -4 penalty, note "over budget"
     • More than 25% over budget: score 1-3 maximum, note "well over budget"
   - Always state the actual Warmmiete vs the budget in the reason/summary.`
    : `   - Warmmiete should be under 33-40% of net income.`;

  return `You are an expert Munich real estate consultant. Analyze an apartment listing for how well it matches the user's profile. Provide a score, a concise summary of pros and cons, and flag any red flags.

TODAY'S DATE: ${today}

USER PROFILE:
${profileSection}

ANALYSIS FRAMEWORK:

1. FINANCIAL REALITY:
   - Calculate the true "Warmmiete" (Kaltmiete + Nebenkosten + Heizkosten if separate). This is the real monthly cost.
   - Calculate Kaltmiete €/m² (Kaltmiete ÷ Wohnfläche) and classify:
     • Bargain: under 15 €/m² (rare in Munich — verify it's not a scam or WBS)
     • Fair: 15-22 €/m² (Munich average)
     • Overpriced: over 22 €/m²
   - Calculate Warmmiete €/m² (true Warmmiete ÷ Wohnfläche) — this is the real cost per m². Report both values in the summary.
${budgetRule}
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
   - The user currently lives in ${p.currentNeighborhood || 'Munich'}. Nearby locations are a plus (shorter move, familiar area, "neighbor advantage").
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
${p.dealbreakers?.length ? p.dealbreakers.map((d) => `- ${d}`).join('\n') : '- None specified'}

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
}

export function buildMessagePrompt(
  userProfile: UserProfile,
  landlordInfo: LandlordInfo,
  messageTemplate?: string,
  profile?: Profile,
  examples?: Example[],
): string {
  const p = profile || {};
  const ex = examples || [];
  const profileSection = [
    p.name ? `Name: ${p.name}` : null,
    p.occupation ? `Beruf: ${p.occupation}` : null,
    p.age ? `Alter: ${p.age}` : null,
    p.languages?.length ? `Sprachen: ${p.languages.join(', ')}` : null,
    p.movingReason ? `Umzugsgrund: ${p.movingReason}` : null,
    p.aboutMe ? `Über mich: ${p.aboutMe}` : null,
    userProfile.aboutMe ? `Zusätzliche Info: ${userProfile.aboutMe}` : null,
    p.strengths?.length ? `Stärken: ${p.strengths.join(', ')}` : null,
    userProfile.adults ? `Erwachsene: ${userProfile.adults}` : null,
    userProfile.children ? `Kinder: ${userProfile.children}` : null,
    userProfile.pets && userProfile.pets !== 'Nein' ? `Haustiere: Ja` : null,
    userProfile.smoker === 'Nein' ? `Nichtraucher` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const isPrivate = landlordInfo.isPrivate ?? false;
  const isTenantNetwork = landlordInfo.isTenantNetwork ?? false;

  let greeting: string;
  if (isTenantNetwork && landlordInfo.name) {
    greeting = `Hallo ${landlordInfo.name},`;
  } else if (landlordInfo.title === 'Frau' && landlordInfo.name) {
    greeting = `Sehr geehrte Frau ${landlordInfo.name},`;
  } else if (landlordInfo.title === 'Herr' && landlordInfo.name) {
    greeting = `Sehr geehrter Herr ${landlordInfo.name},`;
  } else if (landlordInfo.name) {
    greeting = `Sehr geehrte/r ${landlordInfo.name},`;
  } else {
    greeting = 'Sehr geehrte Damen und Herren,';
  }

  const toneGuidance = isTenantNetwork
    ? `TONFALL: Dies ist eine NACHVERMIETUNG. Der Kontakt ist der aktuelle Mieter, nicht der Vermieter. Schreibe freundlich und persönlich (Du-Form). Betone flexible Übernahme, einfache Übergabe, und zeige Verständnis für die Situation des Nachmieters. Erwähne Bereitschaft zur Möbelübernahme falls im Inserat erwähnt.`
    : isPrivate
      ? `TONFALL: Dies ist ein PRIVATER Vermieter. Schreibe respektvoll aber etwas persönlicher. Zeige, dass du ein unkomplizierter, zuverlässiger Mieter bist.`
      : `TONFALL: Dies ist ein GEWERBLICHER Vermieter oder Hausverwaltung. Schreibe formal und professionell. Betone finanzielle Zuverlässigkeit, vollständige Bewerbungsunterlagen und berufliche Stabilität.`;

  const signOffParts = [isTenantNetwork ? 'Viele Grüße' : 'Mit freundlichen Grüßen'];
  if (p.name) signOffParts.push(p.name);
  if (userProfile.phone) signOffParts.push(userProfile.phone);
  const signOff = signOffParts.join('\\n');

  let examplesSection = '';
  if (ex.length > 0) {
    const selected = ex.slice(0, 2);
    examplesSection = `\nBEISPIELNACHRICHTEN (als Orientierung für Ton und Stil):
${selected.map((e, i) => `--- Beispiel ${i + 1} ---\nInserat: ${e.listing}\nNachricht:\n${e.message}`).join('\n\n')}
--- Ende Beispiele ---\n`;
  }

  return `Du schreibst Bewerbungsnachrichten für Wohnungsinserate auf ImmoScout24.

NUTZERPROFIL:
${profileSection}

${toneGuidance}

STRATEGIE — Finde einen "Hook" (Anknüpfungspunkt):
Suche nach einer konkreten Verbindung zwischen dem Inserat und dem Nutzerprofil:
- Lage-Bezug: Liegt die Wohnung in der Nähe des Arbeitsplatzes oder aktuellen Wohnorts? Erwähne es.
- Beruflicher Fit: Bei hochwertigen Wohnungen betone berufliche Stabilität und Einkommen. Bei kreativen/zentralen Lagen betone den ruhigen Lebensstil.
- Ausstattung-Match: Wenn die Wohnung besondere Merkmale hat (Terrasse, Einbauküche, Parkett), zeige echte Begeisterung dafür.
- Problem lösen: Wenn der Vermieter schnell einen Nachmieter sucht, betone Flexibilität bei Einzugsdatum und Möbelübernahme.
Vermeide generische Floskeln wie "Ihre Wohnung hat mein Interesse geweckt" — sei spezifisch.

VORLAGE DES NUTZERS (als Orientierung für Ton und Stil):
${messageTemplate || '(keine Vorlage)'}
${examplesSection}
REGELN:
1. Beginne die Nachricht mit: "${greeting}"
2. Beziehe dich auf 2-3 konkrete Details aus dem Inserat (Lage, Ausstattung, Besonderheiten)
3. Länge: 120-180 Wörter (MAXIMAL 2000 Zeichen — das ist ein hartes Limit des Kontaktformulars)
4. Nenne NICHT das genaue Einkommen — verwende nur allgemeine Formulierungen wie "gesichertes Einkommen" oder "finanziell abgesichert"
5. Kein Markdown, keine Formatierung — nur Fließtext
6. Ende mit exakt diesem Abschluss (jede Zeile in einer neuen Zeile):\n${signOff}
7. Schreibe auf Deutsch
8. Erwähne relevante Stärken des Nutzers, die zum Inserat passen
9. Klingt nicht wie ein KI-Text — variiere Satzlänge, vermeide Aufzählungen, schreibe natürlich

Schreibe NUR die Nachricht, nichts anderes.`;
}

export function buildReplyPrompt(userProfile: UserProfile, landlordInfo: LandlordInfo, profile?: Profile): string {
  const p = profile || {};
  const profileSection = [
    p.name ? `Name: ${p.name}` : null,
    p.occupation ? `Beruf: ${p.occupation}` : null,
    p.age ? `Alter: ${p.age}` : null,
    p.languages?.length ? `Sprachen: ${p.languages.join(', ')}` : null,
    p.movingReason ? `Umzugsgrund: ${p.movingReason}` : null,
    p.aboutMe ? `Über mich: ${p.aboutMe}` : null,
    userProfile.aboutMe ? `Zusätzliche Info: ${userProfile.aboutMe}` : null,
    p.strengths?.length ? `Stärken: ${p.strengths.join(', ')}` : null,
    userProfile.adults ? `Erwachsene: ${userProfile.adults}` : null,
    userProfile.children ? `Kinder: ${userProfile.children}` : null,
    userProfile.pets && userProfile.pets !== 'Nein' ? `Haustiere: Ja` : null,
    userProfile.smoker === 'Nein' ? `Nichtraucher` : null,
    userProfile.income ? `Netto-Haushaltseinkommen: ${userProfile.income}€` : null,
    userProfile.phone ? `Telefon: ${userProfile.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const isTenantNetwork = landlordInfo.isTenantNetwork ?? false;
  const isPrivate = landlordInfo.isPrivate ?? false;

  const toneGuidance = isTenantNetwork
    ? `TONFALL: Dies ist eine NACHVERMIETUNG. Der Kontakt ist der aktuelle Mieter. Schreibe freundlich und persönlich (Du-Form).`
    : isPrivate
      ? `TONFALL: Dies ist ein PRIVATER Vermieter. Schreibe respektvoll aber persönlich (Sie-Form).`
      : `TONFALL: Dies ist ein GEWERBLICHER Vermieter oder Hausverwaltung. Schreibe formal und professionell (Sie-Form).`;

  const signOff = p.name
    ? `Schließe mit "${isTenantNetwork ? 'Viele Grüße' : 'Mit freundlichen Grüßen'}\\n${p.name}" ab.`
    : `Schließe mit "${isTenantNetwork ? 'Viele Grüße' : 'Mit freundlichen Grüßen'}" ab.`;

  return `Du antwortest auf Nachrichten in einer laufenden Konversation über eine Wohnungsbewerbung auf ImmoScout24. Du schreibst als der Bewerber (Mietinteressent), der auf eine Nachricht des Vermieters/Anbieters antwortet.

NUTZERPROFIL:
${profileSection}

${toneGuidance}

KONTEXT: Der Nutzer hat sich bereits auf eine Wohnung beworben. Der Vermieter/Anbieter hat geantwortet. Du schreibst die Folgenachricht des Nutzers.

HÄUFIGE FRAGEN UND WIE DU ANTWORTEN SOLLST:
- Einzugsdatum: Flexibel, kann sich nach dem Vermieter richten. Falls Umzugsgrund bekannt, erwähne ihn kurz.
- Einkommen/Gehalt: "Gesichertes Einkommen" oder "finanziell abgesichert" — NIEMALS genaue Zahlen nennen.
- Unterlagen/Dokumente: Biete an, Gehaltsnachweis, SCHUFA-Auskunft, Mieterselbstauskunft etc. zeitnah zu übermitteln.
- Besichtigungstermin: Zeige Flexibilität, schlage mehrere Zeitfenster vor oder sage "bin zeitlich flexibel".
- Haustiere/Rauchen: Antworte ehrlich basierend auf dem Nutzerprofil.
- WBS: Nur erwähnen wenn im Profil vorhanden.

REGELN:
1. Beziehe dich direkt auf das, was der Vermieter geschrieben hat — beantworte konkrete Fragen.
2. Länge: 50-100 Wörter typisch. Kurz und prägnant. Bei komplexen Fragen maximal 150 Wörter.
3. Nenne NICHT das genaue Einkommen — verwende nur allgemeine Formulierungen.
4. Kein Markdown, keine Formatierung — nur Fließtext.
5. ${signOff}
6. Schreibe auf Deutsch.
7. Klingt nicht wie ein KI-Text — schreibe natürlich und menschlich.
8. Keine Anrede wiederholen wenn sie in der vorherigen Nachricht schon stand — beginne direkt mit der Antwort oder einer kurzen Anrede.

Schreibe NUR die Antwortnachricht, nichts anderes.`;
}
