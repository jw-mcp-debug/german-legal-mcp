import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { formatHitCount, renderSearchTable } from '../../shared/search-format.js';
import type { SearchFormat } from '../../shared/search-format.js';
import { extractSection } from '../../shared/extract-section.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { oldataTools } from './tools/index.js';
import { OldataClient } from './client.js';
import type { OldataHit } from './client.js';

const logger = rootLogger.child({ module: 'oldata-provider' });

export class OldataProvider implements Provider {
  readonly name = 'oldata';

  constructor(private readonly client: OldataClient = new OldataClient()) {}

  getTools(): ToolDefinition[] {
    return oldataTools;
  }

  async shutdown(): Promise<void> {
    logger.info('Open Legal Data provider shutdown');
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'oldata:search') return this.handleSearch(args);
    if (toolName === 'oldata:get') return this.handleGet(args);
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, jurisdiction, court, limit = 10, format = 'compact' } = args as {
      query: string; jurisdiction?: string; court?: string;
      limit?: number; format?: SearchFormat;
    };

    const page = await this.client.search(query, {
      limit,
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(court ? { court } : {}),
    });

    if (page.hits.length === 0) {
      // A filter the endpoint quietly ignores or mishandles looks exactly like
      // "there is no such case law". Measured: court_jurisdiction="Ordentliche
      // Gerichtsbarkeit" returns nothing although hits carry that very value.
      // So an empty filtered result is re-checked unfiltered before it is
      // reported as a finding.
      if (jurisdiction ?? court) {
        const unfiltered = await this.client.search(query, { limit: 1 });
        if (unfiltered.hits.length > 0) {
          return {
            content: [{
              type: 'text',
              text: `Keine Treffer für "${query}" mit dieser Einschränkung — ohne sie `
                + `meldet die Quelle ${unfiltered.totalIsCapped ? 'über ' : ''}`
                + `${unfiltered.total} Entscheidungen.\n\n`
                + 'Der Filter der Quelle ist unzuverlässig: bestimmte Werte liefern '
                + 'null Treffer, obwohl Entscheidungen sie tragen. Ohne Filter suchen '
                + 'und im Ergebnis nach der Gerichtsbarkeit sehen.',
            }],
          };
        }
      }
      return {
        content: [{
          type: 'text',
          text: `Keine Entscheidungen zu "${query}" gefunden. Die Suche ist lexikalisch; `
            + 'für Leitentscheidungen der Bundesgerichte ergänzend rii: nutzen.',
        }],
      };
    }

    const summary = [
      page.totalIsCapped
        // The endpoint stops counting at its ceiling, so the figure is a floor.
        ? `${page.hits.length} von mindestens ${page.total} Treffern (Quelle zählt nicht weiter)`
        : formatHitCount(page.hits.length, page.total),
    ];

    return {
      content: [{
        type: 'text',
        text: renderSearchTable<OldataHit>({
          columns: [
            { header: 'ID', value: (row) => row.id },
            { header: 'Gericht', value: (row) => row.court },
            { header: 'Instanz', value: (row) => row.levelOfAppeal },
            { header: 'Gerichtsbarkeit', value: (row) => row.jurisdiction },
            { header: 'Datum', value: (row) => row.date },
            { header: 'Art', value: (row) => row.decisionType },
            { header: 'Fundstelle', value: (row) => row.snippet, maxWidth: 140 },
          ],
          rows: page.hits,
          summary,
          format,
        }),
      }],
    };
  }

  private async handleGet(args: Record<string, unknown>): Promise<ToolResult> {
    const { id, section, save_path: savePath } = args as {
      id: string; section?: string; save_path?: string;
    };

    const record = await this.client.getCase(id);
    if (record.markdown.trim() === '') {
      return {
        content: [{ type: 'text', text: `Kein Entscheidungstext unter der ID "${id}".` }],
        isError: true,
      };
    }

    const body = section ? extractSection(record.markdown, section) : record.markdown;
    const header = [
      `# ${record.court} · ${record.fileNumber}`,
      '',
      `Datum: ${record.date}`,
      record.decisionType ? `Art: ${record.decisionType}` : '',
      record.ecli ? `ECLI: ${record.ecli}` : '',
      `Quelle: ${this.client.caseUrl(record.id)}`,
      record.sourceUrl ? `Original: ${record.sourceUrl}` : '',
    ].filter(Boolean).join('\n');

    const rendered = `${header}\n\n---\n\n${body}`;
    if (savePath) {
      return saveToFile(savePath, rendered, `${record.court} ${record.fileNumber}`);
    }
    return { content: [{ type: 'text', text: rendered }] };
  }
}
