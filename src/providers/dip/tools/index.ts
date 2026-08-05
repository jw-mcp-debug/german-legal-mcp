import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';

export const dipTools: ToolDefinition[] = [
  {
    name: 'dip:search',
    description:
      'Search Bundestagsdrucksachen (parliamentary documents) via DIP API. ' +
      'Matches title as a literal substring — NOT a keyword AND/OR search. An extra word breaks the match unless it appears verbatim, in that exact order, in the title. ' +
      'For example "Tiergesundheitsgesetz" alone finds dozens of documents, but "Tiergesundheitsgesetz Änderung" finds none, because real titles read "...Änderung des Tiergesundheitsgesetzes..." — reversed order and a different word ending. ' +
      'Prefer a single distinctive word (e.g. a law\'s short title) over a natural-language phrase. ' +
      'Returns metadata: Dokumentnummer, title, type, date, PDF URL. ' +
      'Use dip:get to retrieve full text (e.g., Gesetzesbegründung) of a specific Drucksache.',
    inputSchema: z.object({
      query: z.string().describe('A single distinctive word, or an exact phrase copied verbatim from the title — this is a literal substring match, not AND/OR keyword matching. Adding descriptive words not verbatim in the title (even correct ones, in a different order) returns zero results.'),
      type: z.string().optional().describe('Drucksachetyp filter: "Gesetzentwurf", "Beschlussempfehlung und Bericht", "Kleine Anfrage", "Große Anfrage", "Antrag", etc.'),
      wahlperiode: z.number().optional().describe('Legislative period (e.g., 20, 21)'),
      herausgeber: z.enum(['BT', 'BR']).optional().describe('BT = Bundestag, BR = Bundesrat'),
      date_start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      date_end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    }),
  },
  {
    name: 'dip:get',
    description:
      'Retrieve full text of a Bundestagsdrucksache by Dokumentnummer (e.g., "19/27426" for BT-Drs. 19/27426). ' +
      'Returns the extracted text including Gesetzesbegründung. Use `section` for partial content. ' +
      '`save_path` is for export only — when the user wants the document as a file to keep or process elsewhere.',
    inputSchema: z.object({
      dokumentnummer: z.string().describe('Dokumentnummer (e.g., "19/27426", "20/1234")'),
      section: z.string().optional().describe('Section to extract: heading text (e.g., "Zu § 5 UrhDaG-E", "Begründung", "Zu Artikel 1") or "lines:100-200"'),
      save_path: z.string().optional().describe('Absolute file path for the full document. Relative paths are not supported.'),
    }),
  },
  {
    name: 'dip:search_vorgang',
    description:
      'Search legislative processes (Vorgänge) in DIP. Returns Gesetzgebungsvorgänge with status and linked Drucksachen-Nummern. ' +
      'Useful for tracking a law through the legislative process or finding all related documents. ' +
      'Matches title as a literal substring — NOT a keyword AND/OR search (see dip:search); prefer a single distinctive word over a natural-language phrase.',
    inputSchema: z.object({
      query: z.string().describe('A single distinctive word, or an exact phrase copied verbatim from the title — this is a literal substring match, not AND/OR keyword matching.'),
      vorgangstyp: z.string().optional().describe('Type filter: "Gesetzgebung", "Schriftliche Frage", "EU-Vorlage", etc.'),
      wahlperiode: z.number().optional().describe('Legislative period (e.g., 20, 21)'),
      date_start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      date_end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    }),
  },
  {
    name: 'dip:search_plenarprotokoll',
    description:
      'Search Plenarprotokolle (parliamentary debate transcripts) with full text search. ' +
      'Returns protocols where the search term appears in the debate text.',
    inputSchema: z.object({
      query: z.string().describe('Full text search query (e.g., "Urheberrecht", "UrhDaG")'),
      wahlperiode: z.number().optional().describe('Legislative period (e.g., 20, 21)'),
      herausgeber: z.enum(['BT', 'BR']).optional().describe('BT = Bundestag, BR = Bundesrat'),
      date_start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      date_end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    }),
  },
];
