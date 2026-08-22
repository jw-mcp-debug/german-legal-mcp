import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';
import { SEARCH_FORMAT_DESCRIPTION } from '../../../shared/search-format.js';

export const oldataTools: ToolDefinition[] = [
  {
    name: 'oldata:search',
    description:
      'Full-text search across German court decisions in the Open Legal Data '
      + 'corpus (~424.000 decisions). Its value beside rii: is REACH: rii: carries '
      + 'the federal courts and selected Land portals, while this corpus also holds '
      + 'first- and second-instance decisions — Arbeitsgerichte and '
      + 'Landesarbeitsgerichte, Verwaltungs- and Sozialgerichte — where much of '
      + 'employment, social and administrative law is actually decided. '
      + 'Use rii: for leading federal case law, this for what the instances did. '
      + 'Filter by `jurisdiction` to stay within one branch of the court system.',
    inputSchema: z.object({
      query: z.string().describe('Search terms, e.g. "Befristung Wissenschaftszeitvertragsgesetz"'),
      jurisdiction: z.string().optional()
        .describe('Branch of the court system: "Arbeitsgerichtsbarkeit", '
          + '"Verwaltungsgerichtsbarkeit", "Sozialgerichtsbarkeit", '
          + '"Finanzgerichtsbarkeit", "Verfassungsgerichtsbarkeit"'),
      court: z.string().optional()
        .describe('Court abbreviation as the source uses it, e.g. "LAGBW", "BAG", "BSG"'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
      format: z.enum(['compact', 'compact-json']).optional().default('compact')
        .describe(SEARCH_FORMAT_DESCRIPTION),
    }),
  },
  {
    name: 'oldata:get',
    description:
      'Retrieve one decision by the id from an oldata:search result. '
      + 'BY DEFAULT this returns metadata plus an OUTLINE — the judgment\'s sections '
      + 'with their line ranges and sizes — not the full text, because a full '
      + 'judgment measures around 12.000 tokens against a Tenor of about 150. '
      + 'Read the outline, then ask for what you need with `section` (a heading '
      + 'such as "Tenor" or "Gründe", or "lines:100-200"). Pass `full: true` only '
      + 'when the whole text is genuinely required, or `save_path` to write it to '
      + 'a file. Returns Markdown with court, file number, date and — where the '
      + 'source has one — the ECLI.',
    inputSchema: z.object({
      id: z.string().describe('Decision id from an oldata:search result'),
      section: z.string().optional().describe('Return only this part: "Tenor", "Gründe", or "lines:100-200"'),
      full: z.boolean().optional().default(false).describe('Return the complete decision instead of the outline. Expensive — prefer `section`.'),
      save_path: z.string().optional().describe('Absolute file path for the full decision.'),
    }),
  },
];
