declare const __DEV__: boolean;

const noop = (..._args: unknown[]) => {};

export const log: typeof console.log = __DEV__ ? console.log.bind(console) : noop;
export const debug: typeof console.debug = __DEV__ ? console.debug.bind(console) : noop;
export const warn: typeof console.warn = console.warn.bind(console);
export const error: typeof console.error = console.error.bind(console);
