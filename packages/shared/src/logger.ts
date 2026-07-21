// Cross-context logger. In the extension build, Vite's `define` replaces the
// `__DEV__` token with a literal boolean, so dev-only channels compile to the
// same thing they do today. In non-Vite contexts (server, vitest) `__DEV__` is
// undefined, so the `typeof` guard keeps module-eval safe and degrades the
// dev-only channels to no-ops instead of throwing.
declare const __DEV__: boolean;

const noop = (..._args: unknown[]) => {};

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const log: typeof console.log = isDev ? console.log.bind(console) : noop;
export const debug: typeof console.debug = isDev ? console.debug.bind(console) : noop;
export const warn: typeof console.warn = console.warn.bind(console);
export const error: typeof console.error = console.error.bind(console);
