// Gemini provider — thin wrapper around the Gemini REST API.
import type { AIOptions, AIProvider, AIResult } from './ai-provider';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

function buildGenerationConfig(opts?: AIOptions & { thinkingBudget?: number }): Record<string, any> {
  const config: Record<string, any> = {};
  if (opts?.maxTokens) config.maxOutputTokens = opts.maxTokens;
  if (opts?.thinkingBudget !== undefined) {
    config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  }
  return config;
}

function extractResult(data: any): AIResult {
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text !== undefined)
      ?.map((p: any) => p.text)
      ?.join('') || '';

  const usage = {
    promptTokens: data.usageMetadata?.promptTokenCount || 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
  };

  return { text, usage };
}

async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: AIOptions,
): Promise<AIResult> {
  const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  // Suppress extended thinking by default (faster, cheaper for these tasks)
  const generationConfig = buildGenerationConfig({ ...opts, thinkingBudget: 0 });
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  return extractResult(await response.json());
}

async function generateWithImage(
  apiKey: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  textPrompt: string,
  opts?: AIOptions,
): Promise<AIResult> {
  const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: textPrompt }],
      },
    ],
  };

  // Disable thinking for vision/captcha calls (fast, short output needed)
  const generationConfig = buildGenerationConfig({ ...opts, thinkingBudget: 0 });
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  return extractResult(await response.json());
}

async function validateKey(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}?key=${apiKey}`;
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Gemini',
  defaultModel: DEFAULT_MODEL,
  pricing: { input: 0.15, output: 0.6 }, // USD per 1M tokens (Gemini 2.5 Flash)
  keyUrl: 'https://aistudio.google.com/app/apikey',
  generateText,
  generateWithImage,
  validateKey,
};
