import { getContext, setContext } from 'svelte';

export interface SettingsContext {
  autoSave: () => void;
  autoSaveImmediate: () => Promise<void>;
  checkHealth: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

const KEY = Symbol('settings-context');

export function setSettingsContext(ctx: SettingsContext): void {
  setContext(KEY, ctx);
}

export function getSettingsContext(): SettingsContext {
  return getContext<SettingsContext>(KEY);
}
