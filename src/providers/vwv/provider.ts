import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { formatHitCount, renderSearchTable } from '../../shared/search-format.js';
import type { SearchFormat } from '../../shared/search-format.js';
import { extractSection } from '../../shared/extract-section.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { vwvTools } from './tools/index.js';
import { VwvClient } from './client.js';
import type { VwvSearchMode } from './client.js';

const logger = rootLogger.child({ module: 'vwv-provider' });

interface HitRow {
  readonly docId: string;
  readonly title: string;
  readonly issuer: string | undefined;
  readonly snippet: string;
  readonly relevance: number;
}

export class VwvProvider implements Provider {
  readonly name = 'vwv';

  constructor(private readonly client: VwvClient = new VwvClient()) {}

  getTools(): ToolDefinition[] {
    return vwvTools;
  }

  async shutdown(): Promise<void> {
    logger.info('VwV provider shutdown');
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'vwv:search') return this.handleSearch(args);
    if (toolName === 'vwv:get') return this.handleGet(args);
    if (toolName === 'vwv:issuers') return this.handleIssuers();
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, mode = 'fulltext', limit = 10, format = 'compact' } = args as {
      query: string; mode?: VwvSearchMode; limit?: number; format?: SearchFormat;
    };

    const page = await this.client.search(query, mode);
    if (page.hits.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Keine Verwaltungsvorschrift des Bundes zu "${query}" gefunden.\n\n`
            + 'Die Suche ist rein lexikalisch. Mit vwv:issuers lässt sich prüfen, '
            + 'welche Ressorts das Portal überhaupt führt.',
        }],
      };
    }

    // Titles come from the local listing index; a failure there costs the
    // titles, not the search.
    const index = await this.client.getTitleIndex().catch((error: unknown) => {
      logger.warn('Title index unavailable; falling back to snippets', { error });
      return [];
    });

    const rows: HitRow[] = page.hits.slice(0, limit).map((hit) => {
      const entry = index.find((candidate) => candidate.docId === hit.docId);
      return {
        docId: hit.docId,
        title: entry?.title ?? '—',
        issuer: entry?.issuer,
        snippet: hit.snippet,
        relevance: hit.relevance,
      };
    });

    const unnamed = rows.filter((row) => row.title === '—').length;
    const summary = [formatHitCount(rows.length, page.total)];
    if (unnamed > 0) {
      // Annexes are not in the ministry listings, so their titles are unknown
      // until the document itself is read. Saying so beats a silent dash.
      summary.push(`${unnamed} Treffer sind Anlagen ohne Titel in der Ressortliste `
        + '— Titel und Hauptdokument ergeben sich aus vwv:get.');
    }

    return {
      content: [{
        type: 'text',
        text: renderSearchTable<HitRow>({
          columns: [
            { header: 'DocID', value: (row) => row.docId },
            { header: 'Titel', value: (row) => row.title, maxWidth: 90 },
            { header: 'Ressort', value: (row) => row.issuer, maxWidth: 45 },
            { header: 'Rang', value: (row) => row.relevance },
            { header: 'Fundstelle', value: (row) => row.snippet, maxWidth: 140 },
          ],
          rows,
          summary,
          format,
        }),
      }],
    };
  }

  private async handleGet(args: Record<string, unknown>): Promise<ToolResult> {
    const { doc_id: docId, section, save_path: savePath } = args as {
      doc_id: string; section?: string; save_path?: string;
    };

    const document = await this.client.getDocument(docId);
    if (document.markdown.trim() === '') {
      return {
        content: [{ type: 'text', text: `Kein Inhalt unter der DocID "${docId}".` }],
        isError: true,
      };
    }

    const body = section ? extractSection(document.markdown, section) : document.markdown;
    const parent = document.parentTitle
      ? `\nAnlage zu: ${document.parentTitle}`
        + (document.parentDocId ? ` (\`${document.parentDocId}\`)` : '')
      : '';
    const rendered = `# ${document.title}\n\nVerwaltungsvorschrift des Bundes`
      + `${parent}\nQuelle: ${this.client.documentUrl(docId)}\n\n---\n\n${body}`;

    if (savePath) return saveToFile(savePath, rendered, `${document.title}\n${docId}`);
    return { content: [{ type: 'text', text: rendered }] };
  }

  private async handleIssuers(): Promise<ToolResult> {
    const index = await this.client.getTitleIndex();
    const counts = new Map<string, number>();
    for (const entry of index) {
      counts.set(entry.issuer, (counts.get(entry.issuer) ?? 0) + 1);
    }
    const lines = [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([issuer, count]) => `- ${issuer}: ${count}`);
    return {
      content: [{
        type: 'text',
        text: `Verwaltungsvorschriften des Bundes — ${index.length} Vorschriften `
          + `aus ${counts.size} Ressorts\n\n${lines.join('\n')}`,
      }],
    };
  }
}
