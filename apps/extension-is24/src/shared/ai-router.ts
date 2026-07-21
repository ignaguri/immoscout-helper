// Shared AI routing helper — determines whether to use direct or server mode,
// and which provider to use in direct mode.

import type { LiteLLMConfig } from '@repo/shared-types';
import type { AIProvider, AIResult, ProviderId } from './ai-provider';
import * as C from './constants';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';

export type AIMode = 'direct' | 'server';

export interface AIConfig {
  mode: AIMode;
  provider: ProviderId;
  apiKey: string | undefined;
  serverUrl: string;
  enabled: boolean;
  minScore: number;
  aboutMe: string;
  litellm: Required<LiteLLMConfig>;
  allApiKeys: Partial<Record<ProviderId, string>>;
}

/** LiteLLM is a server-only provider — direct-mode methods throw. */
const litellmProvider: AIProvider = {
  id: 'litellm',
  label: 'LiteLLM (OIDC)',
  defaultModel: C.LITELLM_DEFAULT_MODEL,
  pricing: { input: 0, output: 0 },
  keyUrl: '',
  generateText: async (): Promise<AIResult> => {
    throw new Error('LiteLLM is server-only');
  },
  generateWithImage: async (): Promise<AIResult> => {
    throw new Error('LiteLLM is server-only');
  },
  validateKey: async (): Promise<boolean> => {
    throw new Error('LiteLLM is server-only');
  },
};

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  litellm: litellmProvider,
};

const AI_CONFIG_KEYS = [
  C.AI_MODE_KEY,
  C.AI_PROVIDER_KEY,
  C.AI_API_KEY_GEMINI_KEY,
  C.AI_API_KEY_OPENAI_KEY,
  C.AI_LITELLM_CLIENT_ID_KEY,
  C.AI_LITELLM_CLIENT_SECRET_KEY,
  C.AI_LITELLM_TOKEN_URL_KEY,
  C.AI_LITELLM_BASE_URL_KEY,
  C.AI_LITELLM_MODEL_KEY,
  C.AI_SERVER_URL_KEY,
  C.AI_MIN_SCORE_KEY,
  C.AI_ABOUT_ME_KEY,
];

export async function getAIConfig(): Promise<AIConfig> {
  const stored: Record<string, any> = await chrome.storage.local.get(AI_CONFIG_KEYS);
  const provider: ProviderId = stored[C.AI_PROVIDER_KEY] || 'gemini';
  // LiteLLM forces server mode
  const mode: AIMode = provider === 'litellm' ? 'server' : stored[C.AI_MODE_KEY] || 'direct';

  const providerKeyMap: Record<ProviderId, string> = {
    gemini: stored[C.AI_API_KEY_GEMINI_KEY] || '',
    openai: stored[C.AI_API_KEY_OPENAI_KEY] || '',
    litellm: '', // LiteLLM uses OIDC credentials, not a simple API key
  };
  const apiKey = providerKeyMap[provider] || undefined;
  const serverUrl = stored[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
  const allApiKeys: Partial<Record<ProviderId, string>> = {};
  for (const [id, key] of Object.entries(providerKeyMap)) {
    if (key) allApiKeys[id as ProviderId] = key;
  }
  const config: AIConfig = {
    mode,
    provider,
    apiKey,
    serverUrl,
    enabled: false, // derived below
    minScore: stored[C.AI_MIN_SCORE_KEY] || 5,
    aboutMe: stored[C.AI_ABOUT_ME_KEY] || '',
    allApiKeys,
    litellm: {
      litellmClientId: stored[C.AI_LITELLM_CLIENT_ID_KEY] || '',
      litellmClientSecret: stored[C.AI_LITELLM_CLIENT_SECRET_KEY] || '',
      litellmTokenUrl: stored[C.AI_LITELLM_TOKEN_URL_KEY] || '',
      litellmBaseUrl: stored[C.AI_LITELLM_BASE_URL_KEY] || '',
      litellmModel: stored[C.AI_LITELLM_MODEL_KEY] || C.LITELLM_DEFAULT_MODEL,
    },
  };
  config.enabled = canUseDirect(config) || canUseServer(config);
  return config;
}

/** Returns the AIProvider implementation for the given config */
export function getProvider(config: AIConfig): AIProvider {
  return PROVIDERS[config.provider] ?? geminiProvider;
}

/** Extract LiteLLM OIDC fields to spread into a server request payload. Returns {} for non-litellm providers. */
export function litellmPayload(config: AIConfig): LiteLLMConfig {
  if (config.provider !== 'litellm') return {};
  return { ...config.litellm };
}

/** Whether direct mode can be used (needs API key; LiteLLM is server-only) */
export function canUseDirect(config: AIConfig): boolean {
  if (config.provider === 'litellm') return false;
  return config.mode === 'direct' && !!config.apiKey;
}

/** Whether server mode can be used (needs server URL; LiteLLM also needs OIDC credentials) */
export function canUseServer(config: AIConfig): boolean {
  if (config.mode !== 'server' || !config.serverUrl) return false;
  if (config.provider === 'litellm') {
    const { litellmClientId, litellmClientSecret, litellmTokenUrl, litellmBaseUrl } = config.litellm;
    return !!(litellmClientId && litellmClientSecret && litellmTokenUrl && litellmBaseUrl);
  }
  return true;
}

/** Track token usage in chrome.storage */
export async function trackTokenUsage(promptTokens: number, completionTokens: number): Promise<void> {
  const stats: Record<string, any> = await chrome.storage.local.get([
    C.AI_USAGE_PROMPT_TOKENS_KEY,
    C.AI_USAGE_COMPLETION_TOKENS_KEY,
  ]);
  await chrome.storage.local.set({
    [C.AI_USAGE_PROMPT_TOKENS_KEY]: (stats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + promptTokens,
    [C.AI_USAGE_COMPLETION_TOKENS_KEY]: (stats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + completionTokens,
  });
}
