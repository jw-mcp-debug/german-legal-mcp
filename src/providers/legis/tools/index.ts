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
      'BUND: id is "law/section" (e.g., "bgb/823", "gg/Art. 1", "stgb/§ 242"). ' +
      'Länder: id from legis:search results (format varies by state).',
    inputSchema: z.object({
      id: z.string().describe('Document ID. BUND: "law/section" (e.g., "bgb/823", "gg/Art. 1"). Länder: ID from legis:search.'),
      state: stateEnum.describe('Jurisdiction (e.g., "BUND", "BW", "NW")'),
      save_path: z.string().optional().describe('Save full document to file instead of returning content.'),
    }),
  },
  {
    name: 'legis:toc',
    description:
      'Get table of contents for a law — compact list of section numbers and headings. ' +
      'Much lighter than legis:get for navigating large laws. ' +
      'BUND: id is just the law abbreviation (e.g., "bgb", "stgb"). ' +
      'Länder: id from legis:search results.',
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
