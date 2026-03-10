import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { DipClient } from '../client.js';
import type { ToolResult } from '../../../shared/types.js';

function extractSection(text: string, section: string): string {
  // Line range: "lines:100-200"
  const lineMatch = section.match(/^lines?:(\d+)-(\d+)$/i);
  if (lineMatch) {
    const lines = text.split('\n');
    return lines.slice(Number(lineMatch[1]) - 1, Number(lineMatch[2])).join('\n');
  }
  // Heading match: find section by heading text
  const lines = text.split('\n');
  const startIdx = lines.findIndex(l => l.toLowerCase().includes(section.toLowerCase()));
  if (startIdx === -1) return `Section "${section}" not found.`;
  // Find next heading-like line (starts with "Zu " or is all-caps or blank-line separated block)
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (i > startIdx + 1 && /^Zu\s+(§|Artikel|Art\.|Nummer|Absatz|Teil|Abschnitt)\s/i.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

export async function handleGet(client: DipClient, args: Record<string, unknown>): Promise<ToolResult> {
  const { dokumentnummer, section, save_path } = args as {
    dokumentnummer: string; section?: string; save_path?: string;
  };

  // Search by dokumentnummer in the -text endpoint to get full text
  const result = await client.searchDrucksachenText({ 'f.dokumentnummer': dokumentnummer, rows: 1 });
  if (!result.documents.length) {
    return { content: [{ type: 'text', text: `Drucksache ${dokumentnummer} not found.` }], isError: true };
  }

  const doc = result.documents[0];
  const fullText = doc.text ?? '';
  const header = `# BT-Drs. ${doc.dokumentnummer}\n\n**${doc.titel.replace(/\r\n/g, ' ').trim()}**\nDatum: ${doc.datum}\n${doc.fundstelle?.pdf_url ? `PDF: ${doc.fundstelle.pdf_url}` : ''}\n\n---\n\n`;

  if (save_path) {
    mkdirSync(dirname(save_path), { recursive: true });
    writeFileSync(save_path, header + fullText, 'utf-8');
    return { content: [{ type: 'text', text: `Saved to ${save_path} (${fullText.length} chars)` }] };
  }

  if (section) {
    const extracted = extractSection(fullText, section);
    return { content: [{ type: 'text', text: extracted }] };
  }

  // Default: return header + first 2000 chars as preview
  const preview = fullText.length > 2000 ? fullText.slice(0, 2000) + '\n\n[...truncated. Use `section` or `save_path` for full content.]' : fullText;
  return { content: [{ type: 'text', text: header + preview }] };
}
