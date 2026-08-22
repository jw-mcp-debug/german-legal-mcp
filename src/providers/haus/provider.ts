import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { renderSearchTable, formatHitCount } from '../../shared/search-format.js';
import type { SearchFormat } from '../../shared/search-format.js';
import { extractSection } from '../../shared/extract-section.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { hausTools } from './tools/index.js';
import { HausIndexStore } from './store.js';
import type { HausSearchRow, HausDocumentRecord } from './store.js';
import { HausDataClient, toReference } from './data-client.js';
import { renderBanner, SCOPE_CAVEAT } from './format.js';
import type { HausConfig } from './config.js';
import type { NormativeForce } from '../../contracts/legal-resource.js';

const logger = rootLogger.child({ module: 'haus-provider' });

export class HausProvider implements Provider {
  readonly name = 'haus';
  private store: HausIndexStore | null = null;

  constructor(private readonly config: HausConfig, store?: HausIndexStore) {
    if (store) this.store = store;
  }

  getTools(): ToolDefinition[] {
    return hausTools;
  }

  async initialize(): Promise<void> {
    this.store ??= new HausIndexStore(this.config.indexPath);
    logger.info('House index opened', {
      path: this.config.indexPath,
      documents: this.store.count(),
    });
  }

  async shutdown(): Promise<void> {
    this.store?.close();
    this.store = null;
    logger.info('Haus provider shutdown');
  }

  /** The typed component projection, for consumers that do not speak MCP. */
  createDataClient(): HausDataClient {
    return new HausDataClient(this.requireStore());
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'haus:search') return this.handleSearch(args);
    if (toolName === 'haus:get') return this.handleGet(args);
    if (toolName === 'haus:coverage') return this.handleCoverage();
    if (toolName === 'haus:stale') return this.handleStale(args);
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  private requireStore(): HausIndexStore {
    this.store ??= new HausIndexStore(this.config.indexPath);
    return this.store;
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      query,
      document_type: documentType,
      owner,
      normative_force: normativeForce,
      include_outdated: includeOutdated = false,
      limit = 10,
      format = 'compact',
    } = args as {
      query: string; document_type?: string; owner?: string;
      normative_force?: NormativeForce; include_outdated?: boolean;
      limit?: number; format?: SearchFormat;
    };

    const store = this.requireStore();
    const total = store.count(includeOutdated);
    if (total === 0) {
      // An empty index is a deployment state, not a research finding. Saying so
      // stops a caller reporting "the house has no rule on this" when in truth
      // nothing has been crawled yet.
      return {
        content: [{
          type: 'text',
          text: 'Der Hausindex ist leer — es wurde noch nichts eingelesen. '
            + 'Das ist keine Aussage darüber, ob es zu der Frage eine Regelung gibt.',
        }],
        isError: true,
      };
    }

    const rows = store.search(query, {
      limit,
      ...(documentType ? { documentType } : {}),
      ...(owner ? { owner } : {}),
      ...(normativeForce ? { normativeForce } : {}),
      ...(includeOutdated ? { includeOutdated } : {}),
    });

    logger.info('House index searched', { query, hits: rows.length });

    if (rows.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Keine Treffer für "${query}" unter ${total} indexierten Dokumenten.\n\n`
            + 'Der Index deckt das Thema möglicherweise nicht ab — haus:coverage zeigt, was enthalten ist. '
            + 'Die Suche ist rein lexikalisch und ohne Stammformen; ggf. mit anderen Wortformen erneut suchen.\n\n'
            + SCOPE_CAVEAT,
        }],
      };
    }

    const table = renderSearchTable<HausSearchRow>({
      columns: [
        { header: 'ID', value: (row) => row.id },
        { header: 'Titel', value: (row) => row.title, maxWidth: 90 },
        { header: 'Typ', value: (row) => row.documentType },
        { header: 'Verbindlichkeit', value: (row) => row.normativeForce },
        { header: 'Status', value: (row) => row.status },
        { header: 'Stand', value: (row) => row.asOf },
        { header: 'Zuständig', value: (row) => row.owner },
        { header: 'Fundstelle', value: (row) => row.snippet, maxWidth: 120 },
      ],
      rows,
      summary: [
        formatHitCount(rows.length, total),
        SCOPE_CAVEAT,
      ],
      format,
    });

    return { content: [{ type: 'text', text: table }] };
  }

  private async handleGet(args: Record<string, unknown>): Promise<ToolResult> {
    const { id, url, section, save_path: savePath } = args as {
      id?: string; url?: string; section?: string; save_path?: string;
    };
    if (!id && !url) {
      return {
        content: [{ type: 'text', text: 'Either `id` or `url` is required.' }],
        isError: true,
      };
    }

    const store = this.requireStore();
    const record = id ? store.get(id) : store.getByUrl(url!);
    if (!record) {
      return {
        content: [{ type: 'text', text: `Nicht im Hausindex: ${id ?? url}` }],
        isError: true,
      };
    }

    const banner = renderBanner(toReference(record), {
      staleAfterMonths: this.config.staleAfterMonths,
    });
    const body = section ? extractSection(record.body, section) : record.body;
    const document = `${banner}\nQuelle: ${record.url}\n\n# ${record.title}\n\n---\n\n${body}`;

    if (savePath) {
      return saveToFile(savePath, document, `${record.title}\n${record.url}`);
    }
    return { content: [{ type: 'text', text: document }] };
  }

  private async handleCoverage(): Promise<ToolResult> {
    const store = this.requireStore();
    const rows = store.coverage();
    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'Der Hausindex ist leer.' }] };
    }
    const lines = rows.map((row) =>
      `- ${row.documentType} · ${row.owner}: ${row.count} Dokument(e)`
      + (row.oldestAsOf ? ` · Stand ${row.oldestAsOf} bis ${row.newestAsOf}` : ' · ohne Stand-Angabe'));
    return {
      content: [{
        type: 'text',
        text: `Hausindex: ${store.count()} gültige Dokumente\n\n${lines.join('\n')}\n\n${SCOPE_CAVEAT}`,
      }],
    };
  }

  private async handleStale(args: Record<string, unknown>): Promise<ToolResult> {
    const { max_age_months: maxAgeMonths, limit = 50 } = args as {
      max_age_months?: number; limit?: number;
    };
    const months = maxAgeMonths ?? this.config.staleAfterMonths;
    const cutOff = new Date();
    cutOff.setMonth(cutOff.getMonth() - months);
    const iso = cutOff.toISOString().slice(0, 10);

    const rows = this.requireStore().stale(iso, limit);
    if (rows.length === 0) {
      return {
        content: [{ type: 'text', text: `Kein gültiges Dokument ist älter als ${months} Monate.` }],
      };
    }
    const lines = rows.map((row: HausDocumentRecord) =>
      `- ${row.asOf ?? 'ohne Stand'} · ${row.title} · ${row.owner ?? 'ohne Zuständigkeit'} · ${row.url}`);
    return {
      content: [{
        type: 'text',
        text: `${rows.length} Dokument(e) mit Stand vor ${iso} oder ohne Stand-Angabe:\n\n${lines.join('\n')}`,
      }],
    };
  }
}
