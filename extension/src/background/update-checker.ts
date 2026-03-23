import {
  GITHUB_REPO,
  UPDATE_AVAILABLE_KEY,
  UPDATE_CHECK_ALARM,
  UPDATE_CHECK_INTERVAL_HOURS,
} from '../shared/constants';
import { error, log } from '../shared/logger';

interface UpdateInfo {
  version: string;
  url: string;
  checkedAt: number;
}

/** Strip pre-release/build metadata and return only numeric segments. */
function normalizeVersion(v: string): number[] {
  return v.replace(/-.*$/, '').replace(/\+.*$/, '').split('.').map(Number).filter((n) => !isNaN(n));
}

/** Compare semver strings. Returns true if remote > local. */
function isNewerVersion(remote: string, local: string): boolean {
  const r = normalizeVersion(remote);
  const l = normalizeVersion(local);
  if (r.length === 0 || l.length === 0) return false;
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    );

    if (!response.ok) {
      log(`[Update] GitHub API returned ${response.status} — skipping check`);
      return;
    }

    const release = await response.json();
    const remoteVersion = (release.tag_name || '').replace(/^v/, '');
    const localVersion = chrome.runtime.getManifest().version;
    const htmlUrl = release?.html_url;
    const isValidUrl =
      typeof htmlUrl === 'string' && htmlUrl.startsWith('https://github.com/');

    if (remoteVersion && isNewerVersion(remoteVersion, localVersion) && isValidUrl) {
      const info: UpdateInfo = {
        version: remoteVersion,
        url: htmlUrl,
        checkedAt: Date.now(),
      };
      await chrome.storage.local.set({ [UPDATE_AVAILABLE_KEY]: info });
      log(`[Update] New version available: ${remoteVersion} (current: ${localVersion})`);
    } else {
      await chrome.storage.local.remove(UPDATE_AVAILABLE_KEY);
      log(`[Update] Up to date (${localVersion})`);
    }
  } catch (err) {
    error('[Update] Failed to check for updates:', err);
  }
}

export async function setupUpdateAlarm(): Promise<void> {
  chrome.alarms.create(UPDATE_CHECK_ALARM, {
    periodInMinutes: UPDATE_CHECK_INTERVAL_HOURS * 60,
  });
  // Run an immediate check on startup
  await checkForUpdate();
  log(`[Update] Alarm set — checking every ${UPDATE_CHECK_INTERVAL_HOURS}h`);
}
