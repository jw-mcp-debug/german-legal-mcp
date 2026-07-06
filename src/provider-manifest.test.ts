import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENVIRONMENT_VARIABLES } from './config.js';
import { PROVIDER_MANIFEST } from './provider-manifest.js';

describe('provider manifest', () => {
  it('has unique names and complete enablement metadata', () => {
    const names = PROVIDER_MANIFEST.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);

    const knownVariables = new Set(ENVIRONMENT_VARIABLES.map((entry) => entry.name));
    for (const entry of PROVIDER_MANIFEST) {
      expect(entry.description.length).toBeGreaterThan(0);
      for (const variable of entry.enablementVariables) {
        expect(knownVariables.has(variable), `${entry.name}: ${variable}`).toBe(true);
      }
    }
  });

  it('documents every provider in the README (docs SSOT)', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8').toLowerCase();
    for (const entry of PROVIDER_MANIFEST) {
      expect(readme, `provider ${entry.name} is missing from README.md`)
        .toContain(entry.name.toLowerCase());
    }
  });
});
