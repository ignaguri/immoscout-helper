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
  const ctx = getContext<SettingsContext | undefined>(KEY);
  if (!ctx) {
    throw new Error(
      'Settings context is not available. Ensure this component is rendered within SettingsTab after setSettingsContext() has been called.',
    );
  }
  return ctx;
}
