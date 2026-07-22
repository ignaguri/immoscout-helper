// AI-domain constants: storage keys, usage counters, and model-rotation cooldowns.
// Extracted from the extension app in Phase 2. Consumed by the AI modules in this
// package (via `./constants`) and re-exported by the app's constants.ts for
// `C.AI_*` back-compat.
export { LITELLM_DEFAULT_MODEL } from '@repo/shared';

// AI config / storage keys
export const AI_MODE_KEY = 'aiMode' as const; // 'direct' | 'server'
export const AI_PROVIDER_KEY = 'aiProvider' as const; // 'gemini' | 'openai'
export const AI_ENABLED_KEY = 'aiEnabled' as const;
export const AI_API_KEY_GEMINI_KEY = 'aiApiKeyGemini' as const;
export const AI_API_KEY_OPENAI_KEY = 'aiApiKeyOpenai' as const;
export const AI_LITELLM_CLIENT_ID_KEY = 'aiLitellmClientId' as const;
export const AI_LITELLM_CLIENT_SECRET_KEY = 'aiLitellmClientSecret' as const;
export const AI_LITELLM_TOKEN_URL_KEY = 'aiLitellmTokenUrl' as const;
export const AI_LITELLM_BASE_URL_KEY = 'aiLitellmBaseUrl' as const;
export const AI_LITELLM_MODEL_KEY = 'aiLitellmModel' as const;
export const AI_SERVER_URL_KEY = 'aiServerUrl' as const;
export const AI_MIN_SCORE_KEY = 'aiMinScore' as const;
export const AI_ABOUT_ME_KEY = 'aiAboutMe' as const;
export const AI_CUSTOM_SCORING_PROMPT_KEY = 'aiCustomScoringPrompt' as const;
export const AI_CUSTOM_MESSAGE_PROMPT_KEY = 'aiCustomMessagePrompt' as const;
export const AI_LISTINGS_SCORED_KEY = 'aiListingsScored' as const;
export const AI_LISTINGS_SKIPPED_KEY = 'aiListingsSkipped' as const;
export const AI_USAGE_PROMPT_TOKENS_KEY = 'aiUsagePromptTokens' as const;
export const AI_USAGE_COMPLETION_TOKENS_KEY = 'aiUsageCompletionTokens' as const;

// Model rotation cooldown (exponential backoff: 1m → 2m → 4m → 8m → 15m cap)
export const AI_MODEL_COOLDOWN_BASE_MS = 60_000; // 1 minute
export const AI_MODEL_COOLDOWN_MAX_MS = 900_000; // 15 minutes cap
