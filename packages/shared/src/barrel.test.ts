import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The logger references `__DEV__`, a compile-time global the extension bundler
// defines but the server and vitest do not. It must stay on the
// `@repo/shared/logger` subpath and never leak onto the barrel, or importing
// `@repo/shared` from Node (server, tests) crashes on an undefined `__DEV__`.
describe('@repo/shared barrel', () => {
  it('does not re-export the logger', () => {
    const barrel = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    expect(barrel).not.toMatch(/from\s*['"]\.\/logger['"]/);
  });
});
