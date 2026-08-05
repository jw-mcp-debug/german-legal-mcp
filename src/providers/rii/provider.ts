import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { validateConversion } from '../../shared/converter.js';
import { saveToFile } from '../../shared/save-to-file.js';
import { extractSection } from '../../shared/extract-section.js';
import { riiTools } from './tools/index.js';
import { RiiConverter } from './converter.js';
import {
  createGermanDecisionAdapters,
  CaseLawClient,
} from './client.js';
import type { DecisionAdapter, SourcedDecisionSearchResult } from './types.js';

const logger = rootLogger.child({ module: 'rii-provider' });

export class RiiProvider implements Provider {
  readonly name = 'rii';
  private readonly client: CaseLawClient;

  constructor(
    http: Pick<AxiosInstance, 'get' | 'post'> = axios,
    converter: RiiConverter = new RiiConverter(),
    adapters?: readonly DecisionAdapter[],
  ) {
    this.client = new CaseLawClient(
      adapters ?? createGermanDecisionAdapters(http, converter),
    );
  }

  getTools(): ToolDefinition[] {
    return riiTools;
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const source = (args.source as string) || 'BUND';

    if (toolName === 'rii:search') {
      return this.handleSearch(source, args);
    }
    if (toolName === 'rii:get_decision') {
      if (source === 'ALL') {
        return {
          content: [{
            type: 'text',
            text: 'source "ALL" is only valid for rii:search; choose the source from a search result for rii:get_decision.',
          }],
          isError: true,
        };
      }
      return this.handleGet(source, args);
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  async shutdown(): Promise<void> {
    this.client.shutdown();
    logger.info('RII provider shutdown');
  }

  private async handleSearch(
    source: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const { query, limit = 10 } = args as { query: string; limit?: number };
    const batch = await this.client.searchDecisions(query, {
      sources: source === 'ALL' ? 'ALL' : [source],
      limit,
      limitPerSource: limit,
    });
    const markdown = batch.results
      .map((result, index) => this.formatSearchResult(result, index))
      .join('\n\n');
    const failureNote = batch.failures.length > 0
      ? `\n\nHinweis: ${batch.failures.length} Portal(e) konnten nicht abgefragt werden.`
      : '';
    const sourceNote = source === 'ALL'
      ? ` from ${this.client.sources.length - batch.failures.length} portals`
      : '';
    return {
      content: [{
        type: 'text',
        text: `Found ${batch.results.length}${source === 'ALL' ? ' consolidated' : ''} results${sourceNote}${batch.results.length > 0 ? `:\n\n${markdown}` : '.'}${failureNote}`,
      }],
    };
  }

  private async handleGet(
    source: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const { doc_id, save_path } = args as {
      doc_id: string;
      save_path?: string;
    };
    const { part = 'L', section } = args as {
      part?: string;
      section?: string;
    };
    const decision = await this.client.getDecision(source, doc_id, { part });
    validateConversion(decision.content, source);
    const markdown = [
      `# ${decision.title}`,
      `\n**Gericht:** ${decision.court}`,
      `**Datum:** ${decision.date}`,
      `**Aktenzeichen:** ${decision.fileNumber}`,
      decision.ecli ? `**ECLI:** ${decision.ecli}` : '',
    ].filter(Boolean).join('\n') + `\n\n---\n\n${decision.content}`;

    if (save_path) {
      return saveToFile(
        save_path,
        markdown,
        `Gericht: ${decision.court}\nDatum: ${decision.date}\nAktenzeichen: ${decision.fileNumber}`,
      );
    }
    if (section && source === 'BY') {
      return { content: [{ type: 'text', text: extractSection(markdown, section) }] };
    }
    return { content: [{ type: 'text', text: markdown }] };
  }

  private formatSearchResult(
    result: SourcedDecisionSearchResult,
    index: number,
  ): string {
    return `${index + 1}. **${result.title}**\n   - Quelle: \`${result.source}\`\n   - Doc ID: \`${result.id}\`${result.subtitle ? `\n   - ${result.subtitle}` : ''}${result.snippet ? `\n   - ${result.snippet}` : ''}`;
  }
}
