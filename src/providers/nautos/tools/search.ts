import type { NautosClient } from '../client.js';
import type { ToolResult } from '../../../shared/types.js';

export async function handleSearch(client: NautosClient, args: Record<string, unknown>): Promise<ToolResult> {
  const { query, limit } = args as { query: string; limit?: number };
  const { count, items } = await client.search(query, limit ?? 10);

  if (!items.length) return { content: [{ type: 'text', text: `No results for "${query}".` }] };

  const lines = items.map(r =>
    `- **${r.documentNumber}** (${r.dateOfIssue}) — ${r.title}\n  acCode: \`${r.acCode}\` | Type: ${r.documentType.join(', ')}`,
  );
  return { content: [{ type: 'text', text: `${count} results:\n\n${lines.join('\n')}` }] };
}
