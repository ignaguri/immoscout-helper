import * as C from '../shared/constants';
import { debug, log } from '../shared/logger';
import { currentCheckInterval } from './state';

export function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function humanDelay(baseMs: number, varianceMs: number = 0): number {
  const delay = baseMs + (varianceMs > 0 ? getRandomDelay(-varianceMs, varianceMs) : 0);
  return Math.max(100, delay);
}

// Schedule next alarm with ±20% jitter (one-shot)
export async function scheduleNextAlarm(): Promise<void> {
  const baseSeconds = currentCheckInterval / 1000;
  const jitter = baseSeconds * 0.2;
  const nextSeconds = baseSeconds + getRandomDelay(-jitter, jitter);
  const delayInMinutes = Math.max(1, nextSeconds / 60);
  await chrome.alarms.clear(C.ALARM_NAME);
  await chrome.alarms.create(C.ALARM_NAME, { delayInMinutes });
  log(`[Alarm] Next check in ${Math.round(nextSeconds)}s (base ${baseSeconds}s ± 20%)`);
}

export async function safeCloseTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_e) {
    /* tab may already be closed */
  }
}

// Wait for a content script to become responsive in a tab (ping retry loop)
export async function waitForContentScript(
  tabId: number,
  { maxAttempts = 10, delayMs = 500 }: { maxAttempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return true;
    } catch {
      debug('[Helpers] Content script ping attempt failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

// Wait for a tab to finish loading using chrome.tabs.onUpdated
export function waitForTabLoad(tabId: number, timeoutMs: number = 10000): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;

    const done = (): void => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    };

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };

    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);

    // Check if tab is already complete (race condition guard)
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') done();
      })
      .catch(() => done());
  });
}
