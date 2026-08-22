import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';
import { SEARCH_FORMAT_DESCRIPTION } from '../../../shared/search-format.js';

export const vwvTools: ToolDefinition[] = [
  {
    name: 'vwv:search',
    description:
      'Search the administrative regulations of the German federal ministries '
      + '(Verwaltungsvorschriften des Bundes). These bind the administration '
      + 'itself rather than citizens, and are where the operational detail lives '
      + 'that statutes leave open — notably the Nebenbestimmungen governing public '
      + 'grants (ANBest-P, ANBest-I, BNBest), the Allgemeine Verwaltungsvorschriften '
      + 'zur Bundeshaushaltsordnung, and ministerial Richtlinien. '
      + 'Use `mode: "title"` when you know roughly what a regulation is called, '
      + '`mode: "fulltext"` (default) to search inside the texts. '
      + 'Note that the portal returns document ids; titles are supplied from a '
      + 'locally built index, and where a document is an annex its title may only '
      + 'become clear from vwv:get.',
    inputSchema: z.object({
      query: z.string().describe('Search terms, e.g. "Nebenbestimmungen Zuwendungen" or "Bundeshaushaltsordnung"'),
      mode: z.enum(['fulltext', 'title']).optional().default('fulltext')
        .describe('Search inside the texts (default) or across titles only'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
      format: z.enum(['compact', 'compact-json']).optional().default('compact')
        .describe(SEARCH_FORMAT_DESCRIPTION),
    }),
  },
  {
    name: 'vwv:get',
    description:
      'Retrieve one administrative regulation in full by the document id from a '
      + 'vwv:search result. Returns Markdown. Where the document is an annex — '
      + 'ANBest-P is an annex to the Verwaltungsvorschriften zur Bundeshaushaltsordnung '
      + '— the parent regulation is named, so the chain can be followed. '
      + 'Use `section` for part of a long text: a heading or "lines:100-200". '
      + 'Use `save_path` to write it to a file.',
    inputSchema: z.object({
      doc_id: z.string().describe('Document id from a vwv:search result, e.g. "bsvwvbund_28032011_BMF"'),
      section: z.string().optional().describe('Extract part: heading text or "lines:100-200"'),
      save_path: z.string().optional().describe('Absolute file path for the full document.'),
    }),
  },
  {
    name: 'vwv:issuers',
    description:
      'List the federal ministries whose administrative regulations the portal '
      + 'carries, with how many regulations each has. Useful to see what the '
      + 'source covers before concluding from an empty search that no regulation exists.',
    inputSchema: z.object({}),
  },
];
