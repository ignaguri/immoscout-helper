import 'dotenv/config';
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { buildScoringPrompt, buildMessagePrompt, buildReplyPrompt } from './prompts.js';
import type { ListingDetails, AnalyzeRequestBody, CaptchaRequestBody, ShortenRequestBody, ScoreResult, LogEntryBody, ReplyRequestBody } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, '..', 'data', 'activity.jsonl');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env['PORT'] || 3456;

function getModel(apiKey?: string) {
  if (apiKey) {
    return createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash');
  }
  return google('gemini-2.5-flash');
}

// Format listing details into readable text for the AI
function formatListingForPrompt(details: ListingDetails): string {
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

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Main analysis endpoint
app.post('/analyze', async (req: Request<{}, unknown, AnalyzeRequestBody>, res: Response) => {
  const { listingDetails, landlordInfo, userProfile, messageTemplate, minScore, userNotes, apiKey, profile, examples } = req.body;

  if (!listingDetails) {
    return res.status(400).json({ error: 'listingDetails is required' });
  }

  const model = getModel(apiKey);
  const listingText = formatListingForPrompt(listingDetails);

  // Step 1: Score the listing
  let score: number | undefined;
  let reason: string | undefined;
  let summary: string | undefined;
  let flags: string[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  try {
    const scoringPrompt = buildScoringPrompt(userProfile || {}, profile, examples);
    const { text: scoreText, usage: scoreUsage_ } = await generateText({
      model,
      system: scoringPrompt,
      prompt: `Bewerte dieses Inserat:\n\n${listingText}${userNotes ? `\n\nUSER NOTES: ${userNotes}` : ''}`,
      maxTokens: 1024,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0 } },
      },
    });
    totalPromptTokens += scoreUsage_?.promptTokens || 0;
    totalCompletionTokens += scoreUsage_?.completionTokens || 0;

    // Try direct JSON.parse first (if model returned clean JSON)
    try {
      const directParse = JSON.parse(scoreText.trim()) as ScoreResult;
      score = directParse.score;
      reason = directParse.reason;
      summary = directParse.summary;
      flags = directParse.flags || [];
    } catch {
      // Fall through to extraction
    }

    // If direct parse failed, extract JSON object from text
    if (score === undefined) {
      const scoreIdx = scoreText.indexOf('"score"');
      if (scoreIdx !== -1) {
        const start = scoreText.lastIndexOf('{', scoreIdx);
        if (start !== -1) {
          // Find matching closing brace
          let depth = 0;
          let end = -1;
          for (let i = start; i < scoreText.length; i++) {
            if (scoreText[i] === '{') depth++;
            else if (scoreText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end !== -1) {
            try {
              const parsed = JSON.parse(scoreText.substring(start, end + 1)) as ScoreResult;
              score = parsed.score;
              reason = parsed.reason;
              summary = parsed.summary;
              flags = parsed.flags || [];
            } catch (e) {
              console.warn('[Analyze] JSON parse failed:', (e as Error).message);
            }
          }
        }
      }
    }
    if (score === undefined) {
      console.warn('[Analyze] Could not parse score JSON, defaulting to 5');
      score = 5;
      reason = 'Score konnte nicht ermittelt werden';
    }
  } catch (error) {
    console.error('[Analyze] Scoring API error:', (error as Error).message);
    return res.status(502).json({ error: 'Scoring API failed', details: (error as Error).message });
  }

  const effectiveMinScore = minScore || 5;

  // If score is below threshold, skip message generation
  if (score < effectiveMinScore) {
    console.log(`[Analyze] Score ${score}/${effectiveMinScore} — skipping${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`);
    return res.json({ score, reason, summary, flags, skip: true, usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } });
  }

  // Step 2: Generate personalized message
  let message: string | null = null;
  try {
    const messagePrompt = buildMessagePrompt(userProfile || {}, landlordInfo || {}, messageTemplate, profile, examples);
    const { text, usage: msgUsage } = await generateText({
      model,
      system: messagePrompt,
      prompt: `Schreibe eine Bewerbungsnachricht für dieses Inserat:\n\n${listingText}${userNotes ? `\n\nUSER NOTES (incorporate into the message): ${userNotes}` : ''}`,
      maxTokens: 4096,
    });

    message = text;
    totalPromptTokens += msgUsage?.promptTokens || 0;
    totalCompletionTokens += msgUsage?.completionTokens || 0;
  } catch (error) {
    console.error('[Analyze] Message generation error:', (error as Error).message);
    // Return score but null message — extension falls back to template
  }

  console.log(`[Analyze] Score ${score}/10 — message ${message ? 'generated' : 'fallback to template'}${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`);
  res.json({ score, reason, summary, flags, message, skip: false, usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } });
});

// Captcha solving endpoint
app.post('/captcha', async (req: Request<{}, unknown, CaptchaRequestBody>, res: Response) => {
  const { imageBase64, apiKey } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const model = getModel(apiKey);

  try {
    // Extract base64 data (strip data URL prefix if present)
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid base64 image format. Expected data:image/...;base64,...' });
    }

    const mimeType = match[1] as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    const imageBuffer = Buffer.from(match[2], 'base64');

    // Save captcha image for debugging
    const captchaDir = join(__dirname, '..', 'data', 'captchas');
    try { mkdirSync(captchaDir, { recursive: true }); } catch {}
    const ext = mimeType.split('/')[1] || 'png';
    const captchaPath = join(captchaDir, `captcha-${Date.now()}.${ext}`);
    writeFileSync(captchaPath, imageBuffer);
    console.log(`[Captcha] Image saved: ${captchaPath}`);

    const { text, usage: captchaUsage } = await generateText({
      model,
      system: 'You are a captcha solver. The image contains a security captcha with 5–7 distorted alphanumeric characters (only ASCII letters a–z and digits 0–9, no special characters, no spaces). The text may be warped, have noise, or an unusual background. Examine every character carefully. Output ONLY the alphanumeric characters you see — nothing else, no explanation, no punctuation, no newlines.',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            image: imageBuffer,
            mimeType,
          },
          {
            type: 'text',
            text: 'What are the characters in this captcha?',
          },
        ],
      }],
      maxTokens: 32,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0 } },
      },
    });

    // Strip anything that isn't ASCII alphanumeric (catches Cyrillic, spaces, punctuation)
    const answer = text.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!answer || answer.length < 4) {
      console.warn(`[Captcha] Empty/invalid answer after cleaning (raw: "${text.trim()}")`);
      return res.json({ text: null, error: 'Could not read captcha' });
    }
    console.log(`[Captcha] Solved: "${answer}" (raw: "${text.trim()}")`);
    res.json({ text: answer, usage: { promptTokens: captchaUsage?.promptTokens || 0, completionTokens: captchaUsage?.completionTokens || 0 } });
  } catch (error) {
    console.error('[Captcha] Error:', (error as Error).message);
    res.json({ text: null, error: (error as Error).message });
  }
});

// Message shortening endpoint — rewrites a message to fit within a character limit
app.post('/shorten', async (req: Request<{}, unknown, ShortenRequestBody>, res: Response) => {
  const { message, maxLength, apiKey } = req.body;

  if (!message || !maxLength) {
    return res.status(400).json({ error: 'message and maxLength are required' });
  }

  const model = getModel(apiKey);

  console.log(`[Shorten] Shortening message from ${message.length} to max ${maxLength} chars`);

  try {
    const { text, usage: shortenUsage } = await generateText({
      model,
      system: `Du bist ein Assistent, der Bewerbungsnachrichten für Wohnungsinserate kürzt.

REGELN:
1. Die Nachricht MUSS maximal ${maxLength} Zeichen lang sein (inklusive Leerzeichen und Zeilenumbrüche). Das ist ein hartes Limit.
2. Behalte die Anrede (erste Zeile) und den Abschluss (Grußformel + Name + ggf. Telefonnummer) exakt bei.
3. Kürze nur den Hauptteil: Entferne Wiederholungen, fasse ähnliche Aussagen zusammen, streiche weniger wichtige Details.
4. Behalte die wichtigsten Argumente: Berufliche Stabilität, konkreter Bezug zur Wohnung, persönliche Stärken.
5. Der Ton und Stil müssen gleich bleiben (formal/informell wie im Original).
6. Kein Markdown, keine Formatierung — nur Fließtext.
7. Schreibe NUR die gekürzte Nachricht, nichts anderes.`,
      prompt: `Kürze diese Nachricht auf maximal ${maxLength} Zeichen:\n\n${message}`,
      maxTokens: 2048,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0 } },
      },
    });

    const shortened = text.trim();
    console.log(`[Shorten] Result: ${shortened.length} chars (limit: ${maxLength})`);
    res.json({ message: shortened, originalLength: message.length, shortenedLength: shortened.length, usage: { promptTokens: shortenUsage?.promptTokens || 0, completionTokens: shortenUsage?.completionTokens || 0 } });
  } catch (error) {
    console.error('[Shorten] Error:', (error as Error).message);
    res.status(502).json({ error: 'Shortening failed', details: (error as Error).message });
  }
});

// Reply generation endpoint
app.post('/reply', async (req: Request<{}, unknown, ReplyRequestBody>, res: Response) => {
  const { conversationHistory, userProfile, landlordInfo, listingTitle, apiKey, profile, appointmentAction } = req.body;

  if (!conversationHistory || !conversationHistory.length) {
    return res.status(400).json({ error: 'conversationHistory is required and must not be empty' });
  }

  const model = getModel(apiKey);

  try {
    const systemPrompt = buildReplyPrompt(userProfile || {}, landlordInfo || {}, profile);

    const conversationText = conversationHistory
      .map(msg => {
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
      ].filter(Boolean).join('\n');
      appointmentContext = parts;
    }

    const prompt = `${listingTitle ? `WOHNUNG: ${listingTitle}\n\n` : ''}GESPRÄCHSVERLAUF:\n\n${conversationText}\n\n${appointmentContext ? appointmentContext : 'Schreibe die nächste Antwort des Bewerbers.'}`;

    const { text, usage: replyUsage } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      maxTokens: 2048,
    });

    const reply = text.trim();
    console.log(`[Reply] Generated reply (${reply.length} chars)`);
    res.json({ reply, usage: { promptTokens: replyUsage?.promptTokens || 0, completionTokens: replyUsage?.completionTokens || 0 } });
  } catch (error) {
    console.error('[Reply] Error:', (error as Error).message);
    res.status(502).json({ error: 'Reply generation failed', details: (error as Error).message });
  }
});

// Activity log endpoint
app.post('/log', (req: Request<{}, unknown, LogEntryBody>, res: Response) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    console.log(`[Log] ${entry.action.toUpperCase()} ${entry.listingId} — score ${entry.score ?? '?'}: ${entry.reason ?? 'n/a'}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Log] Write error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to write log' });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] AI server running on http://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Activity log: ${LOG_FILE}`);
});
