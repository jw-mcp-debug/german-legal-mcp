import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { DipClient } from './client.js';
import { dipTools } from './tools/index.js';
import { handleSearch } from './tools/search.js';
import { handleGet } from './tools/get.js';
import { handleSearchVorgang } from './tools/vorgang.js';
import { handleSearchPlenarprotokoll } from './tools/plenarprotokoll.js';

export class DipProvider implements Provider {
  readonly name = 'dip';
  private client = new DipClient();

  getTools(): ToolDefinition[] { return dipTools; }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'dip:search': return handleSearch(this.client, args);
      case 'dip:get': return handleGet(this.client, args);
      case 'dip:search_vorgang': return handleSearchVorgang(this.client, args);
      case 'dip:search_plenarprotokoll': return handleSearchPlenarprotokoll(this.client, args);
      default: return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
