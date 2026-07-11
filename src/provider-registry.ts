import type {
  Provider,
  ProviderManifestEntry,
  ToolDefinition,
  ToolResult,
} from './shared/types.js';

export interface ProviderLoadFailure {
  readonly provider: string;
  readonly error: unknown;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  constructor(private readonly manifest: readonly ProviderManifestEntry[]) {}

  getManifest(): readonly ProviderManifestEntry[] {
    return this.manifest;
  }

  getProviders(): readonly Provider[] {
    return [...this.providers.values()];
  }

  getTools(): ToolDefinition[] {
    return this.getProviders().flatMap((provider) => provider.getTools());
  }

  async load(onFailure?: (failure: ProviderLoadFailure) => void): Promise<void> {
    for (const entry of this.manifest) {
      try {
        const module = await entry.load();
        const provider = module.createProvider();
        if (provider === null) continue;
        if (provider.name !== entry.name) {
          throw new Error(
            `Provider manifest name "${entry.name}" does not match factory name "${provider.name}"`,
          );
        }
        this.providers.set(provider.name, provider);
        await provider.initialize?.();
      } catch (error) {
        // A provider that fails to load, has invalid configuration, or fails to
        // initialize disables ONLY itself — it must never abort the whole server.
        // A single misconfigured optional provider (e.g. a bad Juris login URL)
        // would otherwise take all the other providers down with it. onFailure
        // surfaces the reason to the caller.
        this.providers.delete(entry.name);
        onFailure?.({ provider: entry.name, error });
      }
    }
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const separator = toolName.indexOf(':');
    const provider = separator === -1
      ? undefined
      : this.providers.get(toolName.slice(0, separator));
    if (provider === undefined) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }
    return provider.handleToolCall(toolName, args);
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(
      this.getProviders().map((provider) => provider.shutdown()),
    );
    this.providers.clear();
  }
}
