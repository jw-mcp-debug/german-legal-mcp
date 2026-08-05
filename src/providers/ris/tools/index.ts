import { z } from 'zod';
import type { ToolDefinition } from '../../../shared/types.js';

export const risTools: ToolDefinition[] = [
  {
    name: 'ris:search',
    description:
      'Search the Austrian Rechtsinformationssystem des Bundes (RIS, ris.bka.gv.at). ' +
      'application="bundesrecht"/"landesrecht" searches the broad federal/state collections; ' +
      'results may be consolidated law (BrKons/LrKons) or authentic publications, identified by their returned `applikation`. ' +
      'A `bundesland` filter restricts state law to consolidated LrKons results. ' +
      'application="judikatur" = case law — set `court` (Justiz = OGH/OLG/LG, Vwgh = VwGH, Vfgh = VfGH, Bvwg = BVwG). ' +
      'Use sort="date" for the LATEST decisions. Judikatur results are Rechtssätze (legal principles); ' +
      'each lists its full decision text (Entscheidungstext) — fetch that with ris:get. ' +
      'NOTE: this is AUSTRIAN law. For GERMAN case law use rii:*, for German legislation use legis:*.',
    inputSchema: z.object({
      query: z.string().describe('Full-text search terms (RIS "Suchworte").'),
      application: z
        .enum(['bundesrecht', 'landesrecht', 'judikatur'])
        .optional()
        .default('bundesrecht')
        .describe(
          'RIS collection: "bundesrecht" (federal law), "landesrecht" (state law — all ' +
            'Bundesländer, or filter to one via `bundesland`), or "judikatur" (case law).',
        ),
      court: z
        .enum(['Justiz', 'Vwgh', 'Vfgh', 'Bvwg', 'Lvwg', 'Bfg', 'Dsk'])
        .optional()
        .describe('Judikatur sub-court (default "Justiz"). Only used when application="judikatur".'),
      bundesland: z
        .enum([
          'Wien',
          'Niederoesterreich',
          'Oberoesterreich',
          'Steiermark',
          'Tirol',
          'Kaernten',
          'Salzburg',
          'Vorarlberg',
          'Burgenland',
        ])
        .optional()
        .describe(
          'Filter to one Bundesland — returns that state\'s CONSOLIDATED law (LrKons). ' +
            'Only for application="landesrecht".',
        ),
      sort: z
        .enum(['relevance', 'date'])
        .optional()
        .default('relevance')
        .describe('Result order. "date" = newest first — use this for "latest …" requests.'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default: 10).'),
    }),
  },
  {
    name: 'ris:get',
    description:
      'Retrieve a RIS document as Markdown. Pass the `content_url` returned by ris:search ' +
      '(preferred), or an `id` (Dokumentnummer) together with its `applikation`. ' +
      'Use `section` to pull only part of a document (token-preserving), or `save_path` ' +
      'to write the full document to disk and return metadata only.',
    inputSchema: z.object({
      content_url: z.string().optional().describe('The document HTML URL from a ris:search result.'),
      id: z.string().optional().describe('Dokumentnummer from a search result (requires `applikation`).'),
      applikation: z
        .string()
        .optional()
        .describe('RIS applikation from a search result (e.g. "Justiz", "BrKons"). Required with `id`.'),
      section: z
        .string()
        .optional()
        .describe(
          'Return only part of the document: a Randnummer ("Rn 5"), an Rn range ("Rn 5-9"), ' +
            'a line range ("lines:1-40"), or a heading ("Spruch", "Begründung").',
        ),
      save_path: z
        .string()
        .optional()
        .describe('Absolute file path for the requested section, or the full document when section is omitted. Relative paths are not supported.'),
    }),
  },
  {
    name: 'ris:get_norm',
    description:
      'Retrieve a single paragraph (§) of an Austrian consolidated law as Markdown — ' +
      'e.g. law="ABGB" paragraph="1295". application="bundesrecht" (federal) or ' +
      '"landesrecht" (state law; set `bundesland`). The surgical, token-preserving way ' +
      'to read ONE § instead of a whole statute.',
    inputSchema: z.object({
      law: z.string().describe('Law title or abbreviation (RIS "Titel"), e.g. "ABGB", "UrhG", "Bauordnung".'),
      paragraph: z.string().describe('Paragraph number, e.g. "1295" or "1295a".'),
      application: z
        .enum(['bundesrecht', 'landesrecht'])
        .optional()
        .default('bundesrecht')
        .describe('Federal ("bundesrecht") or state ("landesrecht") law.'),
      bundesland: z
        .enum([
          'Wien',
          'Niederoesterreich',
          'Oberoesterreich',
          'Steiermark',
          'Tirol',
          'Kaernten',
          'Salzburg',
          'Vorarlberg',
          'Burgenland',
        ])
        .optional()
        .describe('Required for application="landesrecht": which Bundesland.'),
      save_path: z.string().optional().describe('Absolute file path for the norm. Relative paths are not supported.'),
    }),
  },
  {
    name: 'ris:toc',
    description:
      'Get the table of contents (Inhaltsverzeichnis) of an Austrian consolidated law — ' +
      'its §§ with headings — so you can then read one with ris:get_norm. Use the full ' +
      'title if an abbreviation fails (e.g. "Urheberrechtsgesetz" rather than "UrhG"). ' +
      'application="bundesrecht" (federal) or "landesrecht" (+ `bundesland`).',
    inputSchema: z.object({
      law: z.string().describe('Law title or abbreviation, e.g. "ABGB", "StGB", "Urheberrechtsgesetz".'),
      application: z
        .enum(['bundesrecht', 'landesrecht'])
        .optional()
        .default('bundesrecht')
        .describe('Federal ("bundesrecht") or state ("landesrecht") law.'),
      bundesland: z
        .enum([
          'Wien',
          'Niederoesterreich',
          'Oberoesterreich',
          'Steiermark',
          'Tirol',
          'Kaernten',
          'Salzburg',
          'Vorarlberg',
          'Burgenland',
        ])
        .optional()
        .describe('Required for application="landesrecht": which Bundesland.'),
      save_path: z.string().optional().describe('Absolute file path for the TOC. Relative paths are not supported.'),
    }),
  },
];
