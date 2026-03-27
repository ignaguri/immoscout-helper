import 'dotenv/config';
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import {
  buildConversationText,
  buildMessagePrompt,
  buildReplyPrompt,
  buildScoringPrompt,
  buildShortenPrompt,
  CAPTCHA_SYSTEM_PROMPT,
  CAPTCHA_USER_PROMPT,
  formatListingWithAnalysis,
  parseScoreJSON,
} from './prompts.js';
import { LITELLM_DEFAULT_MODEL } from '@repo/shared-types';
import type {
  AnalyzeRequestBody,
  CaptchaRequestBody,
  DocumentsRequestBody,
  LiteLLMConfig,
  LogEntryBody,
  ProviderId,
  ReplyRequestBody,
  ShortenRequestBody,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, '..', 'data', 'activity.jsonl');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3456;

// --- LiteLLM OIDC token management ---
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000; // refresh 2 min before expiry
const tokenCache = new Map<string, { jwt: string; expiresAt: number }>();
const tokenInflight = new Map<string, Promise<string>>();

async function getOIDCToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('LiteLLM OIDC credentials not configured (need tokenUrl, clientId, clientSecret)');
  }

  const cacheKey = `${tokenUrl}::${clientId}::${clientSecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.jwt;
  }

  // Deduplicate concurrent refreshes for the same endpoint+clientId
  const existing = tokenInflight.get(cacheKey);
  if (existing) return existing;

  const promise = fetchOIDCToken(tokenUrl, clientId, clientSecret, cacheKey).finally(() => tokenInflight.delete(cacheKey));
  tokenInflight.set(cacheKey, promise);
  return promise;
}

async function fetchOIDCToken(tokenUrl: string, clientId: string, clientSecret: string, cacheKey: string): Promise<string> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`OIDC token error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const jwt = data.access_token;
  if (!jwt) throw new Error('OIDC response missing access_token');
  const expiresIn = data.expires_in || 1800;

  const margin = Math.min(TOKEN_REFRESH_MARGIN_MS, expiresIn * 1000 * 0.1);
  tokenCache.set(cacheKey, { jwt, expiresAt: Date.now() + expiresIn * 1000 - margin });
  console.log(`[LiteLLM] Token refreshed for ${clientId}, expires in ${expiresIn}s`);
  return jwt;
}

async function getModel(provider?: ProviderId, apiKey?: string, litellmConfig?: LiteLLMConfig) {
  if (provider === 'litellm') {
    const { litellmTokenUrl, litellmBaseUrl, litellmClientId, litellmClientSecret } = litellmConfig || {};
    if (!litellmTokenUrl || !litellmBaseUrl || !litellmClientId || !litellmClientSecret) {
      throw new Error('LiteLLM requires tokenUrl, baseUrl, clientId, and clientSecret');
    }
    const token = await getOIDCToken(litellmTokenUrl, litellmClientId, litellmClientSecret);
    const model = litellmConfig?.litellmModel || LITELLM_DEFAULT_MODEL;
    return createOpenAI({ apiKey: token, baseURL: litellmBaseUrl })(model);
  }
  if (provider === 'openai') {
    if (apiKey) return createOpenAI({ apiKey })('gpt-4o-mini');
    return openai('gpt-4o-mini');
  }
  // Default: Gemini
  if (apiKey) return createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash');
  return google('gemini-2.5-flash');
}

/** Resolve model from request body. Throws on invalid config. */
async function resolveModel(req: Request) {
  const { provider, apiKey } = req.body;
  return getModel(provider, apiKey, req.body);
}

/** Gemini-specific thinking suppression — omitted for other providers */
function geminiNoThinking(provider?: ProviderId) {
  if (!provider || provider === 'gemini') {
    return { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } };
  }
  return {};
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// LiteLLM model listing — proxies GET /v1/models from the configured LiteLLM base URL
app.post('/litellm/models', async (req: Request, res: Response) => {
  const { litellmTokenUrl, litellmBaseUrl, litellmClientId, litellmClientSecret } = req.body;
  if (!litellmTokenUrl || !litellmBaseUrl || !litellmClientId || !litellmClientSecret) {
    return res.status(400).json({ error: 'LiteLLM credentials required' });
  }
  try {
    const token = await getOIDCToken(litellmTokenUrl, litellmClientId, litellmClientSecret);
    const response = await fetch(`${litellmBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `LiteLLM API error: ${response.status}` });
    }
    const data = await response.json();
    const models: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean).sort();
    res.json({ models });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Main analysis endpoint
app.post('/analyze', async (req: Request<Record<string, never>, unknown, AnalyzeRequestBody>, res: Response) => {
  const {
    listingDetails,
    landlordInfo,
    userProfile,
    messageTemplate,
    minScore,
    userNotes,
    apiKey,
    provider,
    profile,
    examples,
  } = req.body;

  if (!listingDetails) {
    return res.status(400).json({ error: 'listingDetails is required' });
  }

  let model: Awaited<ReturnType<typeof resolveModel>>;
  try {
    model = await resolveModel(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  const listingText = formatListingWithAnalysis(listingDetails, profile?.maxWarmmiete, userProfile?.income);

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
      ...geminiNoThinking(provider),
    });
    totalPromptTokens += scoreUsage_?.promptTokens || 0;
    totalCompletionTokens += scoreUsage_?.completionTokens || 0;

    const parsed = parseScoreJSON(scoreText);
    if (parsed) {
      score = parsed.score;
      reason = parsed.reason;
      summary = parsed.summary;
      flags = parsed.flags || [];
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
    console.log(
      `[Analyze] Score ${score}/${effectiveMinScore} — skipping${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`,
    );
    return res.json({
      score,
      reason,
      summary,
      flags,
      skip: true,
      usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    });
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

  console.log(
    `[Analyze] Score ${score}/10 — message ${message ? 'generated' : 'fallback to template'}${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`,
  );
  res.json({
    score,
    reason,
    summary,
    flags,
    message,
    skip: false,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  });
});

// Captcha solving endpoint
app.post('/captcha', async (req: Request<Record<string, never>, unknown, CaptchaRequestBody>, res: Response) => {
  const { imageBase64, apiKey, provider } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  let model: Awaited<ReturnType<typeof resolveModel>>;
  try {
    model = await resolveModel(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

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
    try {
      mkdirSync(captchaDir, { recursive: true });
    } catch {}
    const ext = mimeType.split('/')[1] || 'png';
    const captchaPath = join(captchaDir, `captcha-${Date.now()}.${ext}`);
    writeFileSync(captchaPath, imageBuffer);
    console.log(`[Captcha] Image saved: ${captchaPath}`);

    // Cleanup old captcha images when count exceeds threshold
    const MAX_CAPTCHA_FILES = 100;
    try {
      const files = readdirSync(captchaDir)
        .filter((f) => f.startsWith('captcha-'))
        .sort();
      if (files.length > MAX_CAPTCHA_FILES) {
        const toDelete = files.slice(0, files.length - MAX_CAPTCHA_FILES);
        for (const f of toDelete) {
          try {
            unlinkSync(join(captchaDir, f));
          } catch {}
        }
        console.log(`[Captcha] Cleaned up ${toDelete.length} old images`);
      }
    } catch {}

    const { text, usage: captchaUsage } = await generateText({
      model,
      system: CAPTCHA_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: imageBuffer,
              mimeType,
            },
            {
              type: 'text',
              text: CAPTCHA_USER_PROMPT,
            },
          ],
        },
      ],
      maxTokens: 32,
      ...geminiNoThinking(provider),
    });

    // Strip anything that isn't ASCII alphanumeric (catches Cyrillic, spaces, punctuation)
    const answer = text.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!answer || answer.length < 4) {
      console.warn(`[Captcha] Empty/invalid answer after cleaning (raw: "${text.trim()}")`);
      return res.json({ text: null, error: 'Could not read captcha' });
    }
    console.log(`[Captcha] Solved: "${answer}" (raw: "${text.trim()}")`);
    res.json({
      text: answer,
      usage: { promptTokens: captchaUsage?.promptTokens || 0, completionTokens: captchaUsage?.completionTokens || 0 },
    });
  } catch (error) {
    console.error('[Captcha] Error:', (error as Error).message);
    res.json({ text: null, error: (error as Error).message });
  }
});

// Message shortening endpoint — rewrites a message to fit within a character limit
app.post('/shorten', async (req: Request<Record<string, never>, unknown, ShortenRequestBody>, res: Response) => {
  const { message, maxLength, apiKey, provider } = req.body;

  if (!message || !maxLength) {
    return res.status(400).json({ error: 'message and maxLength are required' });
  }

  let model: Awaited<ReturnType<typeof resolveModel>>;
  try {
    model = await resolveModel(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  console.log(`[Shorten] Shortening message from ${message.length} to max ${maxLength} chars`);

  try {
    const { text, usage: shortenUsage } = await generateText({
      model,
      system: buildShortenPrompt(maxLength),
      prompt: `Kürze diese Nachricht auf maximal ${maxLength} Zeichen:\n\n${message}`,
      maxTokens: 2048,
      ...geminiNoThinking(provider),
    });

    const shortened = text.trim();
    console.log(`[Shorten] Result: ${shortened.length} chars (limit: ${maxLength})`);
    res.json({
      message: shortened,
      originalLength: message.length,
      shortenedLength: shortened.length,
      usage: { promptTokens: shortenUsage?.promptTokens || 0, completionTokens: shortenUsage?.completionTokens || 0 },
    });
  } catch (error) {
    console.error('[Shorten] Error:', (error as Error).message);
    res.status(502).json({ error: 'Shortening failed', details: (error as Error).message });
  }
});

// Reply generation endpoint
app.post('/reply', async (req: Request<Record<string, never>, unknown, ReplyRequestBody>, res: Response) => {
  const {
    conversationHistory,
    userProfile,
    landlordInfo,
    listingTitle,
    apiKey,
    provider,
    profile,
    appointmentAction,
    userContext,
  } = req.body;

  if (!conversationHistory || !conversationHistory.length) {
    return res.status(400).json({ error: 'conversationHistory is required and must not be empty' });
  }

  let model: Awaited<ReturnType<typeof resolveModel>>;
  try {
    model = await resolveModel(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  try {
    const systemPrompt = buildReplyPrompt(userProfile || {}, landlordInfo || {}, profile);

    const prompt = buildConversationText(conversationHistory, listingTitle, appointmentAction, userContext);

    const { text, usage: replyUsage } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      maxTokens: 2048,
    });

    const reply = text.trim();
    console.log(`[Reply] Generated reply (${reply.length} chars)`);
    res.json({
      reply,
      usage: { promptTokens: replyUsage?.promptTokens || 0, completionTokens: replyUsage?.completionTokens || 0 },
    });
  } catch (error) {
    console.error('[Reply] Error:', (error as Error).message);
    res.status(502).json({ error: 'Reply generation failed', details: (error as Error).message });
  }
});

// Message refinement endpoint
app.post('/refine', async (req: Request, res: Response) => {
  const {
    currentMessage,
    instructions,
    landlordInfo,
    listingTitle,
    apiKey,
    provider,
    profile,
    isTenantNetwork,
    userProfile,
  } = req.body;

  if (!currentMessage || !instructions) {
    return res.status(400).json({ error: 'currentMessage and instructions are required' });
  }

  try {
    const mergedLandlordInfo = {
      ...(landlordInfo || {}),
      ...(typeof isTenantNetwork === 'boolean' ? { isTenantNetwork } : {}),
    };

    const systemPrompt = buildMessagePrompt(
      userProfile || { aboutMe: '', phone: '' },
      mergedLandlordInfo,
      undefined,
      profile,
    );

    const userPrompt = `CURRENT MESSAGE:\n${currentMessage}\n\nREFINEMENT INSTRUCTIONS:\n${instructions}`;

    let model: Awaited<ReturnType<typeof resolveModel>>;
    try {
      model = await resolveModel(req);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const { text, usage: refineUsage } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 2048,
    });

    const message = text.trim();
    console.log(`[Refine] Refined message (${message.length} chars)`);
    res.json({
      message,
      usage: { promptTokens: refineUsage?.promptTokens || 0, completionTokens: refineUsage?.completionTokens || 0 },
    });
  } catch (error) {
    console.error('[Refine] Error:', (error as Error).message);
    res.status(502).json({ error: 'Refinement failed', details: (error as Error).message });
  }
});

// Documents generation endpoint
const DOCUMENTS_SCRIPT = join(__dirname, '..', '..', 'documents', 'fill_selbstauskunft.py');
const PYTHON_PATH = process.env.DOCUMENTS_PYTHON_PATH || 'python3';

app.post(
  '/documents/generate',
  async (req: Request<Record<string, never>, unknown, DocumentsRequestBody>, res: Response) => {
    const { address, name, ...rest } = req.body;

    if (!address || !name) {
      return res.status(400).json({ error: 'address and name are required' });
    }

    if (!existsSync(DOCUMENTS_SCRIPT)) {
      return res.status(500).json({ error: 'Documents script not found', path: DOCUMENTS_SCRIPT });
    }

    const data = { address, name, ...rest };
    // Remove non-data fields from the JSON payload
    const { attachments, noAttach, ...formData } = data as DocumentsRequestBody;

    const sanitize = (s: string) =>
      s
        .replace(/[/\\.]/g, '')
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strip path-traversal control chars
        .replace(/[\x00-\x1f]/g, '')
        .trim() || 'unknown';
    const street = sanitize(address.split(',')[0]).replace(/\s+/g, '_');
    const namePart = sanitize(name.split(',')[0]) || 'Tenant';
    const outputPath = join('/tmp', `Bewerbungsunterlagen_${namePart}_${street}.pdf`);

    const args = [DOCUMENTS_SCRIPT, '--json', JSON.stringify(formData), '-o', outputPath];
    if (noAttach) args.push('--no-attach');
    if (attachments?.length) {
      args.push('--attach', ...attachments);
    }

    try {
      const result = await new Promise<string>((resolve, reject) => {
        execFile(PYTHON_PATH, args, { timeout: 30000 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout.trim());
          }
        });
      });

      console.log(`[Documents] Generated: ${result}`);

      if (!existsSync(outputPath)) {
        return res.status(500).json({ error: 'PDF generation failed — output file not found' });
      }

      const pdfBuffer = readFileSync(outputPath);

      // Clean up temp file
      try {
        unlinkSync(outputPath);
      } catch {
        /* ignore */
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Bewerbungsunterlagen_${namePart}_${street}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Documents] Error:', (error as Error).message);
      res.status(500).json({ error: 'Document generation failed', details: (error as Error).message });
    }
  },
);

// Activity log endpoint
app.post('/log', (req: Request<Record<string, never>, unknown, LogEntryBody>, res: Response) => {
  if (!req.body.action || !req.body.listingId) {
    return res.status(400).json({ error: 'action and listingId are required' });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  try {
    appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
    console.log(
      `[Log] ${entry.action.toUpperCase()} ${entry.listingId} — score ${entry.score ?? '?'}: ${entry.reason ?? 'n/a'}`,
    );
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
