import { saveToFile } from '../../../shared/save-to-file.js';
import type { NautosClient, TocSection } from '../client.js';
import type { ToolResult } from '../../../shared/types.js';
import * as cache from '../cache.js';
import { htmlToMarkdown } from '../converter.js';
import { extractSection } from '../../../shared/extract-section.js';

function formatToc(sections: TocSection[], depth = 0): string {
  return sections.map(s => {
    const indent = '  '.repeat(depth);
    const label = s.label ? `${s.label} ` : '';
    const line = `${indent}- ${label}${s.title} [\`${s.id}\`]`;
    const children = s.section ? formatToc(s.section, depth + 1) : '';
    return children ? `${line}\n${children}` : line;
  }).join('\n');
}

async function fetchAndCache(client: NautosClient, acCode: string): Promise<cache.CachedDocument> {
  const detail = await client.getDetail(acCode);
  if (!detail.din21Id) throw new Error(`No fulltext available for ${acCode} (format: ${detail.format ?? 'unknown'})`);
  const toc = await client.getToc(detail.din21Id);
  const doc: cache.CachedDocument = { acCode, din21Id: detail.din21Id, detail, toc, sections: {}, fetchedAt: Date.now() };
  await cache.put(doc);
  return doc;
}

function formatOutline(doc: cache.CachedDocument): string {
  const d = doc.detail;
  const header = [
    `# ${d.documentNumber}`,
    `**${d.titleDe}**`,
    d.titleEn ? `*${d.titleEn}*` : '',
    `\nDatum: ${d.dateOfIssue} | Gültig: ${d.valid ? 'Ja' : 'Nein'} | acCode: \`${d.acCode}\` | din21Id: \`${doc.din21Id}\``,
    d.classificationIcs?.length ? `ICS: ${d.classificationIcs.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return `${header}\n\n## Inhaltsverzeichnis\n\n${formatToc(doc.toc)}\n\n---\n*Use \`section\` parameter with a section ID (e.g. \`sub-4.1\`) to fetch content.*`;
}

async function fetchAllSections(client: NautosClient, doc: cache.CachedDocument): Promise<string> {
  const allIds = flattenSectionIds(doc.toc);
  const parts: string[] = [
    formatOutline(doc).split('## Inhaltsverzeichnis')[0]?.trim() ?? '',
  ];
  for (const id of allIds) {
    if (doc.sections[id]) { parts.push(doc.sections[id]); continue; }
    const html = await client.getSection(doc.din21Id, id);
    if (html) {
      const md = htmlToMarkdown(html);
      doc.sections[id] = md;
      parts.push(md);
    }
  }
  await cache.put(doc);
  return parts.join('\n\n---\n\n');
}

function flattenSectionIds(sections: TocSection[]): string[] {
  const ids: string[] = [];
  for (const s of sections) {
    ids.push(s.id);
    if (s.section) ids.push(...flattenSectionIds(s.section));
  }
  return ids;
}

export async function handleGetDocument(client: NautosClient, args: Record<string, unknown>): Promise<ToolResult> {
  const { acCode, section, save_path } = args as { acCode: string; section?: string; save_path?: string };

  let doc = await cache.get(acCode);
  if (!doc) doc = await fetchAndCache(client, acCode);

  // Outline only
  if (!section && !save_path) {
    return { content: [{ type: 'text', text: formatOutline(doc) }] };
  }

  // Section request
  if (section && !save_path) {
    // Line range or heading search → need full text
    if (section.match(/^lines?:/i) || !section.match(/^(sub-|title\.|foreword\.|introduction\.)/)) {
      // Try to find in cached sections, else treat as heading search
      const allMd = Object.values(doc.sections).join('\n\n');
      if (allMd) return { content: [{ type: 'text', text: extractSection(allMd, section) }] };
    }

    // Direct section ID
    if (doc.sections[section]) {
      return { content: [{ type: 'text', text: doc.sections[section] }] };
    }
    const html = await client.getSection(doc.din21Id, section);
    if (!html) return { content: [{ type: 'text', text: `Section "${section}" not found.` }], isError: true };
    const md = htmlToMarkdown(html);
    await cache.putSection(acCode, section, md);
    return { content: [{ type: 'text', text: md }] };
  }

  // Save full document
  if (save_path) {
    const full = await fetchAllSections(client, doc);
    return saveToFile(save_path, full, `${doc.detail.documentNumber} (${flattenSectionIds(doc.toc).length} sections)`);
  }

  return { content: [{ type: 'text', text: formatOutline(doc) }] };
}
