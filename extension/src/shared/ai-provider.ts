// Abstract interface for AI providers used in direct mode.

export interface AIOptions {
  maxTokens?: number;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface AIResult {
  text: string;
  usage: AIUsage;
}

export type ProviderId = 'gemini' | 'openai';

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultModel: string;
  readonly pricing: { input: number; output: number }; // USD per 1M tokens
  readonly keyUrl: string; // URL where users get an API key

  generateText(apiKey: string, systemPrompt: string, userPrompt: string, opts?: AIOptions): Promise<AIResult>;

  generateWithImage(
    apiKey: string,
    systemPrompt: string,
    imageBase64: string,
    mimeType: string,
    textPrompt: string,
    opts?: AIOptions,
  ): Promise<AIResult>;

  validateKey(apiKey: string): Promise<boolean>;
}
