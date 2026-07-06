import { describe, expect, it, vi } from 'vitest';
import type {
  Provider,
  ProviderManifestEntry,
  ToolDefinition,
} from './shared/types.js';
import { ProviderRegistry } from './provider-registry.js';

function fixtureProvider(name: string): Provider {
  return {
    name,
    getTools: (): ToolDefinition[] => [{
      name: `${name}:search`,
      description: 'Fixture search',
      inputSchema: { toJSONSchema: () => ({}) } as ToolDefinition['inputSchema'],
    }],
    handleToolCall: vi.fn(async () => ({
      content: [{ type: 'text', text: name }],
    })),
    shutdown: vi.fn(async () => undefined),
  };
}

function manifestEntry(name: string, provider: Provider | null): ProviderManifestEntry {
  return {
    name,
    description: name,
    distribution: 'public',
    enablementVariables: [],
    capabilities: {
      browser: false,
      cache: false,
      daemon: false,
      search: true,
      documents: false,
    },
    load: async () => ({ createProvider: () => provider }),
  };
}

describe('ProviderRegistry', () => {
  it('uses the manifest for loading, tools, dispatch and shutdown', async () => {
    const provider = fixtureProvider('fixture');
    const registry = new ProviderRegistry([
      manifestEntry('fixture', provider),
      manifestEntry('disabled', null),
    ]);

    await registry.load();

    expect(registry.getProviders()).toEqual([provider]);
    expect(registry.getTools().map((tool) => tool.name)).toEqual(['fixture:search']);
    await expect(registry.handleToolCall('fixture:search', {})).resolves.toEqual({
      content: [{ type: 'text', text: 'fixture' }],
    });
    await registry.shutdown();
    expect(provider.shutdown).toHaveBeenCalledOnce();
  });

  it('rejects a manifest/factory name mismatch', async () => {
    const failures: string[] = [];
    const registry = new ProviderRegistry([
      manifestEntry('expected', fixtureProvider('unexpected')),
    ]);

    await registry.load(({ provider }) => failures.push(provider));

    expect(failures).toEqual(['expected']);
    expect(registry.getProviders()).toEqual([]);
  });

  it('returns a stable unknown-tool result', async () => {
    const registry = new ProviderRegistry([]);
    await expect(registry.handleToolCall('invalid', {})).resolves.toMatchObject({
      isError: true,
    });
  });
});
