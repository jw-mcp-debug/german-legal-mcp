import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

function productionFiles(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Phase 2 architecture gates', () => {
  it('keeps environment access inside the configuration boundary', () => {
    const offenders = productionFiles()
      .filter((path) => !path.endsWith('/config.ts'))
      .filter((path) => /process\.env(?:\.|\[)/.test(readFileSync(path, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('keeps application state-path construction inside state-paths', () => {
    const offenders = productionFiles()
      .filter((path) => !path.endsWith('/shared/state-paths.ts'))
      .filter((path) => (
        /join\(STATE_DIR/.test(readFileSync(path, 'utf-8'))
        || /\.local['"`], ['"`]share['"`], ['"`]german-legal-mcp/.test(
          readFileSync(path, 'utf-8'),
        )
      ));
    expect(offenders).toEqual([]);
  });

  it('uses the shared provider factory and tool-result contracts', () => {
    const providerIndexes = readdirSync(join(sourceRoot, 'providers'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(sourceRoot, 'providers', entry.name, 'index.ts'))
      .filter((path) => {
        try {
          return readFileSync(path, 'utf-8').includes('createProvider');
        } catch {
          return false;
        }
      });

    for (const path of providerIndexes) {
      expect(readFileSync(path, 'utf-8'), path).toContain('ProviderFactory');
    }

    const duplicatedResults = productionFiles()
      .filter((path) => /(?:interface|type)\s+ToolResult\b/.test(
        readFileSync(path, 'utf-8'),
      ))
      .filter((path) => !path.endsWith('/shared/types.ts'));
    expect(duplicatedResults).toEqual([]);
  });

  it('does not terminate the process while importing provider configuration', () => {
    const offenders = productionFiles()
      .filter((path) => path.includes('/providers/') && path.endsWith('/config.ts'))
      .filter((path) => readFileSync(path, 'utf-8').includes('process.exit('));
    expect(offenders).toEqual([]);
  });
});
