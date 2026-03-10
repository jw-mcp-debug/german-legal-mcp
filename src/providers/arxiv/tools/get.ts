import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ArxivClient } from '../client.js';
import type { ToolResult } from '../../../shared/types.js';
import { htmlToMarkdown } from '../converter.js';

function extractSection(text: string, section: string): string {
  const lineMatch = section.match(/^lines?:(\d+)-(\d+)$/i);
  if (lineMatch) {
    const lines = text.split('\n');
    return lines.slice(Number(lineMatch[1]) - 1, Number(lineMatch[2])).join('\n');
  }
  const lines = text.split('\n');
  const needle = section.toLowerCase();
  const startIdx = lines.findIndex(l => l.toLowerCase().includes(needle));
  if (startIdx === -1) return `Section "${section}" not found.`;
  // Find next heading of same or higher level
  const headingMatch = lines[startIdx].match(/^(#{1,6})\s/);
  const level = headingMatch ? headingMatch[1].length : 99;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

export async function handleGet(client: ArxivClient, args: Record<string, unknown>): Promise<ToolResult> {
  const { id, section, save_path } = args as { id: string; section?: string; save_path?: string };

  // Always fetch metadata from Atom API
  const { entries } = await client.search({ id_list: id, max_results: 1 });
  if (!entries.length) return { content: [{ type: 'text', text: `Paper ${id} not found.` }], isError: true };

  const entry = entries[0];
  const header = [
    `# ${entry.title}`,
    `\n**Autoren:** ${entry.authors.join(', ')}`,
    `**Datum:** ${entry.published} | **Kategorien:** ${entry.categories.join(', ')}`,
    entry.doi ? `**DOI:** ${entry.doi}` : '',
    entry.journalRef ? `**Journal:** ${entry.journalRef}` : '',
    `**PDF:** ${entry.pdfUrl}`,
  ].filter(Boolean).join('\n');

  // Full text only when section or save_path requested
  if (!section && !save_path) {
    return { content: [{ type: 'text', text: `${header}\n\n## Abstract\n\n${entry.summary}` }] };
  }

  const html = await client.getHtml(entry.id);
  if (!html) {
    const msg = `${header}\n\n## Abstract\n\n${entry.summary}\n\n---\n*Full HTML text not available for this paper (pre-2024). Use the PDF link above.*`;
    return { content: [{ type: 'text', text: msg }] };
  }

  const markdown = `${header}\n\n---\n\n${htmlToMarkdown(html)}`;

  if (save_path) {
    mkdirSync(dirname(save_path), { recursive: true });
    writeFileSync(save_path, markdown, 'utf-8');
    return { content: [{ type: 'text', text: `Saved to ${save_path} (${markdown.length} chars)` }] };
  }

  return { content: [{ type: 'text', text: extractSection(markdown, section!) }] };
}
