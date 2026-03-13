import * as C from '../shared/constants';

export async function logActivity(entry: Record<string, any>): Promise<void> {
  try {
    const aiSettings: Record<string, any> = await chrome.storage.local.get([C.AI_ENABLED_KEY, C.AI_SERVER_URL_KEY]);
    if (!aiSettings[C.AI_ENABLED_KEY]) return;
    const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
    await fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (_e) {
    console.debug('[Activity] Server logging failed (best-effort)');
  }
}
