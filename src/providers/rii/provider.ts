import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { HTTP_USER_AGENT } from '../../config.js';
import { RiiConverter } from './converter.js';
import { validateConversion } from '../../shared/converter.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { riiTools } from './tools/index.js';
import { handleBayernSearch, handleBayernGetDecision } from './bayern/handler.js';

const logger = rootLogger.child({ module: 'rii-provider' });

const BASE_URL = 'https://www.rechtsprechung-im-internet.de/jportal/portal/page/bsjrsprod.psml';

export class RiiProvider implements Provider {
  readonly name = 'rii';

  constructor(
    private readonly http: Pick<AxiosInstance, 'get'> = axios,
    private readonly converter: RiiConverter = new RiiConverter(),
  ) {}

  getTools(): ToolDefinition[] {
    return riiTools;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const source = (args.source as string) || 'BUND';

    if (toolName === 'rii:search') {
      return source === 'BY' ? handleBayernSearch(args) : this.handleSearch(args);
    }
    if (toolName === 'rii:get_decision') {
      return source === 'BY' ? handleBayernGetDecision(args) : this.handleGetDecision(args);
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  async shutdown(): Promise<void> {
    logger.info('RII provider shutdown');
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, limit = 10 } = args as { query: string; limit?: number };

    const url = `${BASE_URL}/js_peid/Suchportlet2/media-type/html`;
    logger.info('Searching', { query });

    const response = await this.http.get<string>(url, {
      params: {
        formhaschangedvalue: 'yes',
        eventSubmit_doSearch: 'suchen',
        action: 'portlets.jw.MainAction',
        form: 'jurisExpertSearch',
        desc: 'text',
        query,
      },
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });

    const $ = cheerio.load(response.data);
    const results: Array<{ title: string; docId: string; snippet: string }> = [];

    $('a.TrefferlisteHervorheben[id^="tlid"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const docIdMatch = href.match(/doc\.id=([^&]+)/);
      const docId = docIdMatch?.[1];
      const title = $(el).attr('title') || $(el).text().trim();
      if (docId !== undefined && !$(el).attr('id')?.includes('.')) {
        const snippet = $(el).closest('tr').find('.docPreview').text().trim();
        results.push({ title, docId, snippet });
      }
    });

    const limitedResults = results.slice(0, limit);
    const markdown = limitedResults
      .map((r, i) => `${i + 1}. **${r.title}**\n   - Doc ID: \`${r.docId}\`${r.snippet ? `\n   - ${r.snippet}` : ''}`)
      .join('\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} results (showing ${limitedResults.length}):\n\n${markdown}` }] };
  }

  private async handleGetDecision(args: Record<string, unknown>): Promise<ToolResult> {
    const { doc_id, part = 'L', save_path } = args as { doc_id: string; part?: string; save_path?: string };

    logger.info('Fetching decision', { doc_id, part });

    const response = await this.http.get<string>(BASE_URL, {
      params: { 'doc.id': doc_id, 'doc.part': part, showdoccase: '1', paramfromHL: 'true' },
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });

    const decision = this.converter.extractDecision(response.data);
    validateConversion(decision.content, 'Rechtsprechung im Internet');
    const markdown = `# ${decision.title}\n\n**Court:** ${decision.court}  \n**Date:** ${decision.date}  \n**File Number:** ${decision.fileNumber}  \n**ECLI:** ${decision.ecli}\n\n---\n\n${decision.content}`;

    if (save_path) {
      return saveToFile(save_path, markdown, `Court: ${decision.court}\nDate: ${decision.date}\nFile Number: ${decision.fileNumber}\nECLI: ${decision.ecli}`);
    }

    return { content: [{ type: 'text', text: markdown }] };
  }
}
