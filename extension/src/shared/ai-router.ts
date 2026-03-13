// Shared AI routing helper — determines whether to use direct or server mode,
// and which provider to use in direct mode.
import * as C from './constants';
import type { AIProvider, ProviderId } from './ai-provider';
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
}

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
};

const AI_CONFIG_KEYS = [
  C.AI_MODE_KEY,
  C.AI_PROVIDER_KEY,
  C.AI_API_KEY_KEY,
  C.AI_SERVER_URL_KEY,
  C.AI_MIN_SCORE_KEY,
  C.AI_ABOUT_ME_KEY,
];

export async function getAIConfig(): Promise<AIConfig> {
  const stored: Record<string, any> = await chrome.storage.local.get(AI_CONFIG_KEYS);
  const mode: AIMode = stored[C.AI_MODE_KEY] || 'direct';
  const provider: ProviderId = stored[C.AI_PROVIDER_KEY] || 'gemini';
  const apiKey = stored[C.AI_API_KEY_KEY] || undefined;
  const serverUrl = stored[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
  const config: AIConfig = {
    mode,
    provider,
    apiKey,
    serverUrl,
    enabled: false, // derived below
    minScore: stored[C.AI_MIN_SCORE_KEY] || 5,
    aboutMe: stored[C.AI_ABOUT_ME_KEY] || '',
  };
  config.enabled = canUseDirect(config) || canUseServer(config);
  return config;
}

/** Returns the AIProvider implementation for the given config */
export function getProvider(config: AIConfig): AIProvider {
  return PROVIDERS[config.provider] ?? geminiProvider;
}

/** Whether direct mode can be used (needs API key) */
export function canUseDirect(config: AIConfig): boolean {
  return config.mode === 'direct' && !!config.apiKey;
}

/** Whether server mode can be used (needs server URL) */
export function canUseServer(config: AIConfig): boolean {
  return config.mode === 'server' && !!config.serverUrl;
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
