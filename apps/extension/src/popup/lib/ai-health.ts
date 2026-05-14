import { PROVIDERS } from '../../shared/ai-router';
import type { PopupSettings } from './storage';

const HEALTH_TIMEOUT_MS = 3000;
const DEFAULT_SERVER_URL = 'http://localhost:3456';

export async function checkAiHealth(settings: PopupSettings): Promise<boolean> {
  if (settings.aiMode === 'direct') {
    const key = settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai;
    if (!key) return false;
    try {
      const provider = PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini;
      return await provider.validateKey(key);
    } catch {
      return false;
    }
  }

  const url = settings.aiServerUrl || DEFAULT_SERVER_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
