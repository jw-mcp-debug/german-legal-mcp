import type { ToolResult } from '../../../shared/types.js';
import { searchBayern, fetchBayernDecision } from './client.js';
import { convertBayernDecision } from './converter.js';
import { extractSection } from '../../../shared/extract-section.js';

export async function handleBayernSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const { query, limit = 10 } = args as { query: string; limit?: number };
  const results = await searchBayern(query, limit);

  if (!results.length) return { content: [{ type: 'text', text: 'No results found.' }] };

  const text = results.map((r, i) =>
    `${i + 1}. **${r.title}**\n   - Doc ID: \`${r.docId}\`${r.subtitle ? `\n   - ${r.subtitle}` : ''}`
  ).join('\n\n');

  return { content: [{ type: 'text', text: `Found ${results.length} results:\n\n${text}` }] };
}

export async function handleBayernGetDecision(args: Record<string, unknown>): Promise<ToolResult> {
  const { doc_id, save_path, section } = args as { doc_id: string; save_path?: string; section?: string };

  const html = await fetchBayernDecision(doc_id);
  const d = convertBayernDecision(html);

  const header = [
    `# ${d.title || d.fileNumber}`,
    `\n**Gericht:** ${d.court}`,
    `**Datum:** ${d.date}`,
    `**Aktenzeichen:** ${d.fileNumber}`,
    d.fundstelle ? `**Fundstelle:** ${d.fundstelle}` : '',
    d.normenketten.length ? `**Normenketten:** ${d.normenketten.join('; ')}` : '',
    d.leitsaetze.length ? `\n## Leitsätze\n\n${d.leitsaetze.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const markdown = `${header}\n\n---\n\n${d.content}`;

  if (save_path) {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(save_path), { recursive: true });
    writeFileSync(save_path, markdown, 'utf-8');
    return { content: [{ type: 'text', text: `Saved to ${save_path} (${markdown.length} chars)\n\nGericht: ${d.court}\nDatum: ${d.date}\nAz: ${d.fileNumber}` }] };
  }

  if (section) {
    return { content: [{ type: 'text', text: extractSection(markdown, section) }] };
  }

  return { content: [{ type: 'text', text: markdown }] };
}
