import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';
import { SEARCH_FORMAT_DESCRIPTION } from '../../../shared/search-format.js';

const SCOPE =
  'Covers this institution\'s own published, currently valid administrative '
  + 'documents — Handreichungen, FAQs, Merkblätter, Prozessbeschreibungen, '
  + 'published Beschlüsse, and suppliers\' published terms. It answers "how do '
  + 'we proceed here", NOT "what is the legal position": for statutes and case '
  + 'law use the legis:, rii:, ris:, eul: and icu: tools instead.';

export const hausTools: ToolDefinition[] = [
  {
    name: 'haus:search',
    description:
      `Full-text search across the local house-document index. ${SCOPE} `
      + 'Matching is lexical (BM25) and unstemmed, so German compounds and '
      + 'inflections do not match each other — search "Lizenzvertrag" AND '
      + '"Lizenzverträge" if the first returns little. Superseded and expired '
      + 'documents are excluded unless include_outdated is set. Every hit '
      + 'carries a banner stating its binding force and Stand; report both when '
      + 'you use it.',
    inputSchema: z.object({
      query: z.string().describe('Search terms, e.g. "Lizenzvertrag Kündigung" or "§ 60d UrhG"'),
      document_type: z.string().optional().describe('Restrict to one type, e.g. "Handreichung", "FAQ", "Merkblatt"'),
      owner: z.string().optional().describe('Restrict to the responsible office'),
      source: z.string().optional().describe('Restrict to one corpus, e.g. "opus4-bht" for the official gazette (Amtliche Mitteilungen)'),
      normative_force: z.enum(['binding', 'guidance', 'record', 'draft']).optional()
        .describe('Restrict by binding force. "binding" = Beschluss/Dienstanweisung; "guidance" = Handreichung/FAQ'),
      include_outdated: z.boolean().optional().default(false)
        .describe('Include superseded, expired and unreachable documents (default: false)'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
      format: z.enum(['compact', 'compact-json']).optional().default('compact')
        .describe(SEARCH_FORMAT_DESCRIPTION),
    }),
  },
  {
    name: 'haus:get',
    description:
      'Retrieve one house document in full from the local index, by the id from '
      + 'a haus:search result or by its source URL. Returns Markdown preceded by '
      + 'the binding-force and Stand banner. Use `section` for part of a long '
      + 'document: a heading, "lines:100-200". Use `save_path` to write it to a file.',
    inputSchema: z.object({
      id: z.string().optional().describe('Document id from a haus:search result'),
      url: z.string().optional().describe('Source URL, as an alternative to id'),
      section: z.string().optional().describe('Extract part: heading text or "lines:100-200"'),
      save_path: z.string().optional().describe('Absolute file path for the full document.'),
    }),
  },
  {
    name: 'haus:coverage',
    description:
      'Report what the house index actually contains — counts per document type '
      + 'and responsible office, with the oldest and newest Stand in each group. '
      + 'Call this before concluding from an empty haus:search that no rule '
      + 'exists: an absent topic means the corpus does not cover it, which is a '
      + 'different statement and the one that is usually true.',
    inputSchema: z.object({}),
  },
  {
    name: 'haus:stale',
    description:
      'List indexed documents whose stated Stand is older than the cut-off, or '
      + 'that state none at all — oldest first. A maintenance report for the '
      + 'people who own these documents, not a research tool.',
    inputSchema: z.object({
      max_age_months: z.number().optional().describe('Cut-off in months (default: the configured GLMCP_HAUS_STALE_MONTHS)'),
      limit: z.number().optional().default(50).describe('Maximum number of rows (default: 50)'),
    }),
  },
];
