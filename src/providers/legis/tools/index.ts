import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';
import { STATES } from '../types.js';

const stateEnum = z.enum(STATES);

export const legisTools: ToolDefinition[] = [
  {
    name: 'legis:search',
    description:
      'Search German state legislation (Landesrecht) by keyword. ' +
      'Returns results with IDs for retrieval via legis:get. ' +
      'Official abbreviations such as "HKG" or "PolG" are often more reliable than descriptive phrases. ' +
      'A hit is either a whole law or a single norm, and its id retrieves exactly that, so naming the section — "§ 110 BerlHG" — is the way to reach one. ' +
      'Where a norm has earlier fassungen the in-force one is listed and the rest are counted in the subtitle. ' +
      'Covers all 16 Bundesländer. BUND does not support search — use legis:get directly.',
    inputSchema: z.object({
      query: z.string().describe('Search query (e.g., "Polizeigesetz", "Schulgesetz", "PolG")'),
      state: stateEnum.describe('State code (e.g., "BW", "BY", "NW"). Not "BUND" — federal law has no search.'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
    }),
  },
  {
    name: 'legis:get',
    description:
      'Retrieve a specific law/norm from German federal or state legislation. ' +
      'BUND: id is "law/section" — law is the lowercase abbreviation (e.g. "bgb", "gg", "stgb"), section is just the number. ' +
      'An optional "§", "Art.", "Paragraph", or "Para." prefix on the section is stripped automatically, so "bgb/823", "bgb/§ 823", and "bgb/§823" are equivalent; ' +
      'use whichever prefix matches the document type (§ for codes, Art. for the Grundgesetz). ' +
      'Not every law is hosted under its plain abbreviation on gesetze-im-internet.de — some reissued laws use a different URL slug. ' +
      'If this returns "not found", a subscription provider that resolves abbreviations through its own index may still find it. ' +
      'Länder: id from legis:search results (format varies by state).',
    inputSchema: z.object({
      id: z.string().describe('Document ID. BUND: "law/section" (e.g., "bgb/823", "gg/Art. 1"). Länder: ID from legis:search.'),
      state: stateEnum.describe('Jurisdiction (e.g., "BUND", "BW", "NW")'),
      save_path: z.string().optional().describe('Absolute file path for the full document. Relative paths are not supported.'),
    }),
  },
  {
    name: 'legis:toc',
    description:
      'Get table of contents for a law — compact list of section numbers and headings. ' +
      'Much lighter than legis:get for navigating large laws. ' +
      'Entries print a document id where the source publishes one; that id goes straight back into legis:get. ' +
      'BUND: id is just the law abbreviation (e.g., "bgb", "stgb"). ' +
      'Länder: id from legis:search results — the id of a single norm is accepted and read as its law.',
    inputSchema: z.object({
      id: z.string().describe('Law identifier. BUND: law abbreviation (e.g., "bgb"). Länder: ID from legis:search.'),
      state: stateEnum.describe('Jurisdiction (e.g., "BUND", "BW", "NW")'),
      from: z.string().optional().describe('Start at section (e.g., "§ 823", "Art 1"). Inclusive.'),
      to: z.string().optional().describe('End at section (e.g., "§ 853"). Inclusive.'),
      depth: z.number().optional().describe('Max depth level (0=top structure only, 1=sections, 2=subsections, 3=norms)'),
    }),
  },
  {
    name: 'legis:states',
    description: 'List all 17 available German jurisdictions (BUND + 16 Bundesländer) with their backends.',
    inputSchema: z.object({}),
  },
];
