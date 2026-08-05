import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';

export const icuTools: ToolDefinition[] = [
  {
    name: 'icu:search',
    description:
      'Search for decisions and opinions of the Court of Justice of the European Union (CJEU) via InfoCuria. ' +
      'Returns list with case numbers, ECLI, dates, and document IDs for retrieval.',
    inputSchema: z.object({
      query: z.string().describe('Search term (e.g., "Pelham", "Sampling", "Urheberrecht")'),
      language: z.string().optional().default('DE').describe('Language code (e.g., "DE", "FR", "EN"). Default: DE'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
    }),
  },
  {
    name: 'icu:get_document',
    description:
      'Retrieve a CJEU decision or opinion from InfoCuria by published case number, CELEX number or Logic Doc ID. ' +
      'Returns full text in Markdown with Randnummern as [Rn. 5]{.rn}. ' +
      'A published case number (e.g., "C-476/17", "T-108/25") is converted to its CELEX form internally, so all three forms work. ' +
      'A CELEX number (e.g., "62017CJ0476") or the "Logic Doc ID" from an icu:search result (e.g., "id_320668") resolve with one request fewer. ' +
      'Use `section` for partial content: "Rn 5-12", heading text, or "lines:100-200". ' +
      'Use `save_path` when you want the document written to a file for later use outside this conversation.',
    inputSchema: z.object({
      case_id: z.string().describe('Published case number (e.g., "C-476/17"), CELEX number (e.g., "62017CJ0476") or "Logic Doc ID" from an icu:search result (e.g., "id_320668").'),
      language: z.string().optional().default('DE').describe('Language code (default: DE)'),
      section: z.string().optional().describe('Extract section: "Rn 5-12", heading text, or "lines:100-200"'),
      save_path: z.string().optional().describe('Absolute file path for the full document. Relative paths are not supported.'),
    }),
  },
];
