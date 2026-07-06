import type { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { NautosClient } from './client.js';
import { nautosTools } from './tools/index.js';
import { handleSearch } from './tools/search.js';
import { handleGetDocument } from './tools/get-document.js';

export class NautosProvider implements Provider {
  readonly name = 'nautos';

  constructor(private readonly client: NautosClient = new NautosClient()) {}

  getTools(): ToolDefinition[] { return nautosTools; }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'nautos:search': return handleSearch(this.client, args);
      case 'nautos:get_document': return handleGetDocument(this.client, args);
      default: return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
