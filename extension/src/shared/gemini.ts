// Thin wrapper around the Gemini REST API for direct calls from the extension.
// No SDK dependency — just fetch().

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GeminiOptions {
  maxTokens?: number;
  thinkingBudget?: number; // 0 = disable thinking
}

export interface GeminiUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GeminiResult {
  text: string;
  usage: GeminiUsage;
}

function buildGenerationConfig(opts?: GeminiOptions): Record<string, any> {
  const config: Record<string, any> = {};
  if (opts?.maxTokens) config.maxOutputTokens = opts.maxTokens;
  if (opts?.thinkingBudget !== undefined) {
    config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  }
  return config;
}

function extractResult(data: any): GeminiResult {
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text !== undefined)
    ?.map((p: any) => p.text)
    ?.join('') || '';

  const usage: GeminiUsage = {
    promptTokens: data.usageMetadata?.promptTokenCount || 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
  };

  return { text, usage };
}

/** Text-only generation */
export async function geminiGenerateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: GeminiOptions,
): Promise<GeminiResult> {
  const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  const generationConfig = buildGenerationConfig(opts);
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

  const data = await response.json();
  return extractResult(data);
}

/** Vision generation (for captcha solving) */
export async function geminiGenerateWithImage(
  apiKey: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  textPrompt: string,
  opts?: GeminiOptions,
): Promise<GeminiResult> {
  const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: textPrompt },
        ],
      },
    ],
  };

  const generationConfig = buildGenerationConfig(opts);
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

  const data = await response.json();
  return extractResult(data);
}

/** Validate an API key by fetching model metadata (lightweight, no generation) */
export async function geminiValidateKey(apiKey: string): Promise<boolean> {
  try {
    const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}?key=${apiKey}`;
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
