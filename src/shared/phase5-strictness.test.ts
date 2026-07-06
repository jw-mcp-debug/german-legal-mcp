import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function productionFiles(directory = join(process.cwd(), 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Phase 5 strictness gates', () => {
  it('keeps every agreed production compiler flag enabled', () => {
    const config = JSON.parse(readFileSync(
      join(process.cwd(), 'tsconfig.base.json'),
      'utf-8',
    )) as { compilerOptions?: Record<string, unknown> };
    const flags = [
      'strict',
      'noUncheckedIndexedAccess',
      'exactOptionalPropertyTypes',
      'noImplicitOverride',
      'useUnknownInCatchVariables',
      'noFallthroughCasesInSwitch',
      'noImplicitReturns',
    ];
    for (const flag of flags) {
      expect(config.compilerOptions?.[flag], flag).toBe(true);
    }
  });

  it('has no explicit any in production sources', () => {
    const offenders = productionFiles().filter((path) => (
      /(?::\s*any\b|<any>|as\s+any\b|any\[\])/.test(
        readFileSync(path, 'utf-8')
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, ''),
      )
    ));
    expect(offenders).toEqual([]);
  });
});
