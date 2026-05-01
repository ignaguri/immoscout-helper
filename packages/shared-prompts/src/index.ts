// Shared prompt builders for direct Gemini/OpenAI calls.
// Single source of truth — consumed by both the extension and the server.

import type {
  AppointmentAction,
  ConversationMessage,
  Example,
  LandlordInfo,
  ListingDetails,
  Profile,
  ScoreResult,
  UserProfile,
} from '@repo/shared-types';
import {
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_SCORING_TEMPLATE,
  MESSAGE_PLACEHOLDERS,
  renderTemplate,
  SCORING_PLACEHOLDERS,
  validateTemplate,
} from './templates';
import type { PlaceholderInfo } from './templates';

export type {
  ListingDetails,
  LandlordInfo,
  UserProfile,
  Profile,
  Example,
  ConversationMessage,
  AppointmentAction,
  ScoreResult,
};

export { computeFinancialAnalysis, formatFinancialAnalysis, formatListingWithAnalysis, parseGermanNumber } from './financial-analysis';
export type { BudgetComparison, FinancialAnalysis, IncomeRatio, QuickcheckData } from './financial-analysis';

export {
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_SCORING_TEMPLATE,
  MESSAGE_PLACEHOLDERS,
  renderTemplate,
  SCORING_PLACEHOLDERS,
  validateTemplate,
};
export type { PlaceholderInfo };

// ── Format listing details into readable text ──

export function formatListingForPrompt(details: ListingDetails): string {
  const lines: string[] = [];
  if (details.title) lines.push(`Titel: ${details.title}`);
  if (details.address) lines.push(`Adresse: ${details.address}`);
  if (details.kaltmiete) lines.push(`Kaltmiete: ${details.kaltmiete}`);
  if (details.warmmiete) lines.push(`Warmmiete: ${details.warmmiete}`);
  if (details.nebenkosten) lines.push(`Nebenkosten: ${details.nebenkosten}`);
  if (details.kaution) lines.push(`Kaution: ${details.kaution}`);
  if (details.wohnflaeche) lines.push(`Wohnfläche: ${details.wohnflaeche}`);
  if (details.zimmer) lines.push(`Zimmer: ${details.zimmer}`);
  if (details.etage) lines.push(`Etage: ${details.etage}`);
  if (details.bezugsfrei) lines.push(`Bezugsfrei ab: ${details.bezugsfrei}`);
  if (details.haustiere) lines.push(`Haustiere: ${details.haustiere}`);
  if (details.rauchen) lines.push(`Rauchen: ${details.rauchen}`);
  if (details.baujahr) lines.push(`Baujahr: ${details.baujahr}`);
  if (details.objekttyp) lines.push(`Objekttyp: ${details.objekttyp}`);
  if (details.heizungsart) lines.push(`Heizungsart: ${details.heizungsart}`);
  if (details.energieverbrauch) lines.push(`Energieverbrauch: ${details.energieverbrauch}`);
  if (details.energieeffizienzklasse) lines.push(`Energieeffizienzklasse: ${details.energieeffizienzklasse}`);
  if (details.balkon) lines.push(`Balkon/Terrasse: ${details.balkon}`);
  if (details.garage) lines.push(`Garage/Stellplatz: ${details.garage}`);
  if (details.aufzug) lines.push(`Aufzug: ${details.aufzug}`);
  if (details.keller) lines.push(`Keller: ${details.keller}`);
  if (details.internet) lines.push(`Internet: ${details.internet}`);
  if (details.wbs) lines.push(`WBS: ${details.wbs}`);
  if (details.heizkosten) lines.push(`Heizkosten: ${details.heizkosten}`);
  if (details.energietraeger) lines.push(`Energieträger: ${details.energietraeger}`);
  if (details.objektzustand) lines.push(`Objektzustand: ${details.objektzustand}`);

  if (details.extraAttributes) {
    for (const [key, value] of Object.entries(details.extraAttributes)) {
      lines.push(`${key}: ${value}`);
    }
  }

  if (details.amenities?.length) {
    lines.push(`Ausstattung: ${details.amenities.join(', ')}`);
  }

  if (details.description) {
    lines.push(`\nBeschreibung:\n${details.description}`);
  }

  if (lines.length === 0 && details.rawText) {
    lines.push(`Inseratstext:\n${details.rawText}`);
  }

  return lines.join('\n');
}

// ── Scoring prompt ──

export function buildScoringPrompt(
  userProfile: UserProfile,
  profile?: Profile,
  customTemplate?: string,
): string {
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

  const dealbreakersList = p.dealbreakers?.length
    ? p.dealbreakers.map((d) => `- ${d}`).join('\n')
    : '- None specified';

  const template = customTemplate?.trim() ? customTemplate : DEFAULT_SCORING_TEMPLATE;
  return renderTemplate(template, {
    today,
    profileSection,
    budgetRule,
    currentNeighborhood: p.currentNeighborhood || 'Munich',
    dealbreakersList,
  });
}

// ── Message prompt ──

export function buildMessagePrompt(
  userProfile: UserProfile,
  landlordInfo: LandlordInfo,
  messageTemplate?: string,
  profile?: Profile,
  examples?: Example[],
  customTemplate?: string,
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

  const template = customTemplate?.trim() ? customTemplate : DEFAULT_MESSAGE_TEMPLATE;
  return renderTemplate(template, {
    profileSection,
    toneGuidance,
    greeting,
    signOff,
    messageTemplate: messageTemplate || '(keine Vorlage)',
    examplesSection,
  });
}

// ── Reply prompt ──

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

// ── Shorten prompt ──

export function buildShortenPrompt(maxLength: number): string {
  return `Du bist ein Assistent, der Bewerbungsnachrichten für Wohnungsinserate kürzt.

REGELN:
1. Die Nachricht MUSS maximal ${maxLength} Zeichen lang sein (inklusive Leerzeichen und Zeilenumbrüche). Das ist ein hartes Limit.
2. Behalte die Anrede (erste Zeile) und den Abschluss (Grußformel + Name + ggf. Telefonnummer) exakt bei.
3. Kürze nur den Hauptteil: Entferne Wiederholungen, fasse ähnliche Aussagen zusammen, streiche weniger wichtige Details.
4. Behalte die wichtigsten Argumente: Berufliche Stabilität, konkreter Bezug zur Wohnung, persönliche Stärken.
5. Der Ton und Stil müssen gleich bleiben (formal/informell wie im Original).
6. Kein Markdown, keine Formatierung — nur Fließtext.
7. Schreibe NUR die gekürzte Nachricht, nichts anderes.`;
}

// ── Captcha prompts ──

export const CAPTCHA_SYSTEM_PROMPT =
  'You are a captcha solver. The image contains a security captcha with 5–7 distorted alphanumeric characters (only ASCII letters a–z and digits 0–9, no special characters, no spaces). The text may be warped, have noise, or an unusual background. Examine every character carefully. Output ONLY the alphanumeric characters you see — nothing else, no explanation, no punctuation, no newlines.';

export const CAPTCHA_USER_PROMPT = 'What are the characters in this captcha?';

// ── Helper: build conversation text for reply generation ──

export function buildConversationText(
  conversationHistory: ConversationMessage[],
  listingTitle?: string,
  appointmentAction?: AppointmentAction,
  userContext?: string,
): string {
  const conversationText = conversationHistory
    .map((msg) => {
      const label = msg.role === 'user' ? 'ICH (Bewerber)' : 'VERMIETER/ANBIETER';
      const time = msg.timestamp ? ` [${msg.timestamp}]` : '';
      return `${label}${time}:\n${msg.text}`;
    })
    .join('\n\n');

  let appointmentContext = '';
  if (appointmentAction) {
    const actionLabels: Record<string, string> = {
      accept: 'ZUSAGE (Termin annehmen)',
      reject: 'ABSAGE (Termin ablehnen)',
      alternative: 'ALTERNATIVVORSCHLAG (anderen Termin anfragen)',
    };
    const parts = [
      `\nTERMINEINLADUNG:`,
      appointmentAction.date ? `Datum: ${appointmentAction.date}` : null,
      appointmentAction.time ? `Zeit: ${appointmentAction.time}` : null,
      appointmentAction.location ? `Ort: ${appointmentAction.location}` : null,
      `GEWÜNSCHTE AKTION: ${actionLabels[appointmentAction.type] || appointmentAction.type}`,
      appointmentAction.userContext ? `ZUSÄTZLICHER KONTEXT VOM NUTZER: ${appointmentAction.userContext}` : null,
      `Schreibe eine passende kurze Antwort (30-60 Wörter). Berücksichtige den Kontext des Nutzers falls vorhanden.`,
    ]
      .filter(Boolean)
      .join('\n');
    appointmentContext = parts;
  }

  const userInstruction = userContext
    ? `\nKONTEXT/ANWEISUNGEN VOM NUTZER: ${userContext}\nBerücksichtige diese Anweisungen in deiner Antwort.`
    : '';

  return `${listingTitle ? `WOHNUNG: ${listingTitle}\n\n` : ''}GESPRÄCHSVERLAUF:\n\n${conversationText}\n\n${appointmentContext ? appointmentContext : `${userInstruction}\nSchreibe die nächste Antwort des Bewerbers.`}`;
}

// ── Helper: strip trailing commas outside JSON strings ──

function stripTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === ',') {
      // Look ahead past whitespace for closing brace/bracket
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (input[j] === '}' || input[j] === ']') {
        continue; // skip trailing comma
      }
    }

    result += ch;
  }

  return result;
}

// ── Helper: parse score JSON from AI response ──

export function parseScoreJSON(text: string): ScoreResult | null {
  // Strip markdown code fences if present
  let sanitized = text.trim();
  const fenceMatch = sanitized.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
  if (fenceMatch) sanitized = fenceMatch[1].trim();

  // Try direct JSON.parse first (fast path)
  try {
    const direct = JSON.parse(sanitized) as ScoreResult;
    if (typeof direct.score === 'number') return direct;
  } catch {
    // Fall through — may have trailing commas or surrounding text
  }

  // Strip trailing commas (string-aware) and retry direct parse
  const cleaned = stripTrailingCommas(sanitized);
  try {
    const direct = JSON.parse(cleaned) as ScoreResult;
    if (typeof direct.score === 'number') return direct;
  } catch {
    // Fall through
  }

  // Extract JSON object from text via brace matching
  const scoreIdx = cleaned.indexOf('"score"');
  if (scoreIdx === -1) return null;

  const start = cleaned.lastIndexOf('{', scoreIdx);
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    const parsed = JSON.parse(cleaned.substring(start, end + 1)) as ScoreResult;
    if (typeof parsed.score === 'number') return parsed;
  } catch {
    // Fall through
  }

  return null;
}
