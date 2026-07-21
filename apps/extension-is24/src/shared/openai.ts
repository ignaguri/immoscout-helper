// OpenAI provider — thin wrapper around the OpenAI Chat Completions API.
import type { AIOptions, AIProvider, AIResult } from './ai-provider';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function extractResult(data: any): AIResult {
  const text = data.choices?.[0]?.message?.content || '';
  const usage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  };
  return { text, usage };
}

async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: AIOptions,
): Promise<AIResult> {
  const body: Record<string, any> = {
    model: opts?.model ?? DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  if (opts?.maxTokens) body.max_tokens = opts.maxTokens;

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
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
  const body: Record<string, any> = {
    model: opts?.model ?? DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
          { type: 'text', text: textPrompt },
        ],
      },
    ],
  };

  if (opts?.maxTokens) body.max_tokens = opts.maxTokens;

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  return extractResult(await response.json());
}

async function validateKey(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${OPENAI_API_BASE}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: DEFAULT_MODEL,
  pricing: { input: 0.15, output: 0.6 }, // USD per 1M tokens (GPT-4o-mini)
  keyUrl: 'https://platform.openai.com/api-keys',
  generateText,
  generateWithImage,
  validateKey,
};
