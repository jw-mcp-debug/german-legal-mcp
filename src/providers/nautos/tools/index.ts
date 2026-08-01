import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';

export const nautosTools: ToolDefinition[] = [
  {
    name: 'nautos:search',
    description:
      'Search DIN/EN/ISO technical standards on nautos.de by document number. ' +
      'Returns acCode, document number, title, date, and document type. ' +
      'Use nautos:get_document with the acCode to retrieve content.',
    inputSchema: z.object({
      query: z.string().describe('Document number to search for (e.g., "DIN EN ISO 9001", "DIN 4109")'),
      limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    }),
  },
  {
    name: 'nautos:get_document',
    description:
      'Retrieve a DIN/EN/ISO standard by acCode (from nautos:search). ' +
      'Returns outline (metadata + table of contents) by default. ' +
      'Use `section` to fetch a specific section by ID (e.g., "sub-4.1", "sub-a.1", "foreword.nat"). ' +
      'Use `save_path` to save the full document to a file.',
    inputSchema: z.object({
      acCode: z.string().describe('Document identifier from search results (e.g., "DE30062916")'),
      section: z.string().optional().describe('Section ID from TOC (e.g., "sub-4.1", "title.nat") or "lines:100-200"'),
      save_path: z.string().optional().describe('Absolute file path for the full document. Relative paths are not supported.'),
    }),
  },
];
