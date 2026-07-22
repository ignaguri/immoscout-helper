import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Architecture guard: the background engine runs in the MV3 service worker,
// which has no `document` and must stay site-agnostic. These rules were
// verified by hand through Phases 3-4; this test makes them automatic before
// a second app (OpenRent, Phase 5) starts copying patterns.

const SRC = fileURLToPath(new URL('.', import.meta.url)); // packages/core-engine/src/

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Module specifiers from `import ... from '...'`, `export ... from '...'`,
// dynamic `import('...')`, and bare side-effect `import '...'`.
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  match = re.exec(source);
  while (match !== null) {
    specs.push(match[1] ?? match[2] ?? match[3]);
    match = re.exec(source);
  }
  return specs;
}

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /^@repo\/site-adapter\/(dom|content)$/,
    why: 'DOM/content-realm code pulls `document` into the service-worker bundle',
  },
  { pattern: /^@repo\/core-engine(\/|$)/, why: 'engine must not import its own barrel (circular init)' },
  { pattern: /(^|\/)apps\//, why: 'engine must not depend on any app' },
  { pattern: /immoscout-api/, why: 'IS24-specific API types belong in the app, not the shared engine' },
];

describe('@repo/core-engine import boundaries', () => {
  const files = collectSourceFiles(SRC);

  it('finds engine source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rule of FORBIDDEN) {
    it(`no engine import matches ${rule.pattern} (${rule.why})`, () => {
      const violations: string[] = [];
      for (const file of files) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          if (rule.pattern.test(spec)) {
            violations.push(`${file.replace(SRC, '')} imports '${spec}'`);
          }
        }
      }
      expect(violations, `Boundary violation(s):\n${violations.join('\n')}`).toEqual([]);
    });
  }
});
