import type {
  Provider,
  ProviderFactory,
  ToolDefinition,
  ToolResult,
} from '../../shared/types.js';
import { readBooleanEnv } from '../../config.js';
import { rootLogger } from '../../shared/logger.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { validateConversion } from '../../shared/converter.js';
import { invalidateAllSessions, JPORTAL_STATES } from '../../shared/clients/jportal.js';
import { legisTools } from './tools/index.js';
import { GiiAdapter } from './adapters/gii.js';
import { JPortalAdapter } from './adapters/jportal.js';
import { NiedersachsenAdapter } from './adapters/niedersachsen.js';
import { BayernAdapter } from './adapters/bayern.js';
import { BrandenburgAdapter } from './adapters/brandenburg.js';
import { SachsenAdapter } from './adapters/sachsen.js';
import { BremenAdapter } from './adapters/bremen.js';
import { NRWAdapter } from './adapters/nrw.js';
import type { LegisAdapter, TocEntry } from './types.js';

const logger = rootLogger.child({ module: 'legis' });

export class LegisProvider implements Provider {
  readonly name = 'legis';
  private adapterMap = new Map<string, LegisAdapter>();

  constructor(adapters?: readonly LegisAdapter[]) {
    const configuredAdapters = adapters ?? [
      new GiiAdapter(),
      new JPortalAdapter(),
      new NiedersachsenAdapter(),
      new BayernAdapter(),
      new BrandenburgAdapter(),
      new SachsenAdapter(),
      new BremenAdapter(),
      new NRWAdapter(),
    ];
    for (const adapter of configuredAdapters) {
      for (const state of adapter.states) {
        this.adapterMap.set(state, adapter);
      }
    }
  }

  getTools(): ToolDefinition[] {
    return legisTools;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'legis:search') return await this.handleSearch(args);
    if (toolName === 'legis:get') return await this.handleGet(args);
    if (toolName === 'legis:toc') return await this.handleToc(args);
    if (toolName === 'legis:states') return this.handleStates();
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  async shutdown(): Promise<void> {
    invalidateAllSessions();
    logger.info('Legis provider shutdown');
  }

  private getAdapter(state: string): LegisAdapter {
    const adapter = this.adapterMap.get(state);
    if (!adapter) throw new Error(`State "${state}" is not yet supported. Use legis:states to see available jurisdictions.`);
    return adapter;
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, state, limit = 10 } = args as { query: string; state: string; limit?: number };
    const results = await this.getAdapter(state).search(state, query, limit);

    const markdown = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   - ID: \`${r.id}\`\n   - ${r.subtitle}${r.date ? ` (${r.date})` : ''}`)
      .join('\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} results:\n\n${markdown}` }] };
  }

  private async handleGet(args: Record<string, unknown>): Promise<ToolResult> {
    const { id, state, save_path } = args as { id: string; state: string; save_path?: string };
    const entry = await this.getAdapter(state).get(state, id);
    validateConversion(entry.content, `Landesrecht ${state}`);

    const markdown = `# ${entry.title}\n\n${entry.content}\n\n---\n**Source:** ${entry.url}`;

    if (save_path) {
      return saveToFile(save_path, markdown, `Title: ${entry.title}\nURL: ${entry.url}`);
    }

    return { content: [{ type: 'text', text: markdown }] };
  }

  private async handleToc(args: Record<string, unknown>): Promise<ToolResult> {
    const { id, state, from, to, depth } = args as {
      id: string; state: string; from?: string; to?: string; depth?: number;
    };
    const adapter = this.getAdapter(state);

    let entries: TocEntry[];
    if (adapter.toc) {
      entries = await adapter.toc(state, id);
    } else {
      // Default: extract headings from full document markdown
      const entry = await adapter.get(state, id);
      entries = [];
      for (const line of entry.content.split('\n')) {
        const m = line.match(/^(#{1,6})\s+(.+)/);
        if (!m) continue;
        const heading = m[2] ?? '';
        const d = (m[1]?.length ?? 1) - 1; // h1→0, h2→1, etc.
        const nm = heading.match(/^(§§?\s*\S+|Art\.?\s*\S+)\s*(.*)/);
        entries.push({ depth: d, num: nm?.[1] || '', title: nm?.[2] || heading });
      }
    }

    // Apply depth filter
    if (depth !== undefined) entries = entries.filter((e) => e.depth <= depth);

    // Apply range filter
    if (from || to) {
      const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
      const fromN = from ? norm(from) : null;
      const toN = to ? norm(to) : null;
      let inRange = !fromN;
      entries = entries.filter((e) => {
        const n = norm(e.num);
        if (fromN && n === fromN) inRange = true;
        if (!inRange) return false;
        if (toN && n === toN) { inRange = false; return true; }
        return true;
      });
    }

    const lines = entries.map((e) => {
      const indent = '  '.repeat(e.depth);
      if (!e.num) return `${indent}**${e.title}**`;
      return e.title ? `${indent}${e.num} ${e.title}` : `${indent}${e.num}`;
    });

    return { content: [{ type: 'text', text: `${entries.length} entries:\n\n${lines.join('\n')}` }] };
  }

  private handleStates(): ToolResult {
    const jportalStates = JPORTAL_STATES;
    const lines = [
      '| State | Status | Backend |',
      '|-------|--------|---------|',
      '| BUND | ✅ Available | gesetze-im-internet.de |',
      ...jportalStates.map((s) => `| ${s} | ✅ Available | jportal REST API |`),
      '| NI | ✅ Available | voris.wolterskluwer-online.de |',
      '| BY | ✅ Available | gesetze-bayern.de |',
      '| BB | ✅ Available | bravors.brandenburg.de |',
      '| SN | ✅ Available | revosax.sachsen.de |',
      '| HB | ✅ Available | transparenz.bremen.de |',
      '| NW | ✅ Available | recht.nrw.de |',
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_LEGIS_ENABLED', true)) return null;
  return new LegisProvider();
};
