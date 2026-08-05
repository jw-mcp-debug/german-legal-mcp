import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENVIRONMENT_VARIABLES } from './config.js';
import { getProviderManifest, PROVIDER_MANIFEST } from './provider-manifest.js';

describe('provider manifest', () => {
  it('has unique component ids', () => {
    const ids = PROVIDER_MANIFEST.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps component metadata and configuration contracts aligned', async () => {
    const knownVariables = new Set(ENVIRONMENT_VARIABLES.map((entry) => entry.name));
    await Promise.all(PROVIDER_MANIFEST.map(async (entry) => {
      const { component } = await entry.load();
      expect(component.metadata.id).toBe(entry.id);
      expect(component.metadata.distribution).toBe(entry.distribution);
      expect(component.metadata.description.length).toBeGreaterThan(0);
      expect(component.metadata.resourceTypes.length).toBeGreaterThan(0);
      expect(component.createDataClient).toEqual(expect.any(Function));
      const client = component.createDataClient() as unknown as Record<string, unknown>;
      expect(client.search).toEqual(expect.any(Function));
      expect(client.get).toEqual(expect.any(Function));
      expect(typeof client.getTableOfContents === 'function')
        .toBe(component.metadata.runtime.tableOfContents);
      expect(typeof client.getAuthenticationStatus === 'function')
        .toBe(component.metadata.runtime.authentication);
      expect(typeof client.getOperationalStatus === 'function')
        .toBe(component.metadata.runtime.status);
      for (const variable of component.metadata.enablementVariables) {
        expect(knownVariables.has(variable), `${entry.id}: ${variable}`).toBe(true);
      }
    }));
  });

  it('documents every provider in the README (docs SSOT)', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8').toLowerCase();
    for (const entry of PROVIDER_MANIFEST) {
      expect(readme, `provider ${entry.id} is missing from README.md`)
        .toContain(entry.id.toLowerCase());
    }
  });

  it('filters by distribution without mutating the manifest', () => {
    expect(getProviderManifest()).toBe(PROVIDER_MANIFEST);
    expect(getProviderManifest('public').map((entry) => entry.id)).toEqual([
      'arxiv',
      'dip',
      'eul',
      'icu',
      'legis',
      'rii',
      'ris',
      'nautos',
    ]);
  });

  it('lazy-loads all public provider modules', async () => {
    await Promise.all(getProviderManifest('public').map(async (entry) => {
      const mod = await entry.load();
      expect(mod.component.metadata.id).toBe(entry.id);
      expect(mod.component.createMcpProvider).toEqual(expect.any(Function));
    }));
  });
});
