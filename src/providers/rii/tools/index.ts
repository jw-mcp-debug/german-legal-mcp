import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';

export const riiTools: ToolDefinition[] = [
  {
    name: 'rii:search',
    description:
      'Search for court decisions. Default source "bund": federal courts (BVerfG, BGH, BVerwG, BFH, BAG, BSG, BPatG). ' +
      'Source "bayern": Bavarian state courts (AG, LG, OLG, VG, VGH, FG, ArbG, LAG, BayVerfGH). ' +
      'Returns list of decisions with metadata and doc IDs for retrieval.',
    inputSchema: z.object({
      query: z.string().describe('Search query. For file numbers (Aktenzeichen): use ONLY the file number without keywords (e.g., "I ZR 115/16"). For topics: keywords (e.g., "Metall auf Metall", "BGB § 823").'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
      source: z.enum(['BUND', 'BY']).optional().default('BUND').describe('Source: "BUND" (federal, default) or "BY" (Bavarian state courts via gesetze-bayern.de)'),
    }),
  },
  {
    name: 'rii:get_decision',
    description:
      'Retrieve full text of a court decision by doc ID. ' +
      'Returns decision in Markdown format with metadata (court, date, file number, ECLI). ' +
      'Use source "BY" for IDs from gesetze-bayern.de (format: Y-300-Z-...).',
    inputSchema: z.object({
      doc_id: z.string().describe('Document ID from search results (e.g., "jb-KORE704442026" for BUND, "Y-300-Z-GRURRS-B-2021-N-55699" for BY)'),
      part: z.enum(['K', 'L']).optional().default('L').describe('K = Kurztext (summary), L = Langtext (full text, default). Only for source "BUND".'),
      save_path: z.string().optional().describe('Absolute file path for the full document. Relative paths are not supported. Returns metadata only.'),
      source: z.enum(['BUND', 'BY']).optional().default('BUND').describe('Source: "BUND" (federal, default) or "BY" (Bavarian state courts)'),
      section: z.string().optional().describe('Section heading or "lines:100-200". Only for source "BY".'),
    }),
  },
];
