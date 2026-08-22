import * as cheerio from 'cheerio';
import type { NormativeForce } from '../../../contracts/legal-resource.js';
import type { HausIngestInput } from '../ingest.js';

export const OPUS4_SOURCE_ID = 'opus4-bht';

/**
 * The gazette. Everything promulgated in it is house law by definition —
 * Grundordnung, Geschäftsordnungen, Wahlordnung, Zugangs- und Prüfungsordnungen.
 *
 * This is the one place a binding force may be *derived* rather than declared,
 * and only because the series is itself a declared metadata field: a document
 * carries "Amtliche Mitteilungen" because the Gremienreferat published it
 * there, which is precisely the act that makes it binding. Reading the force
 * off a title instead — "Ordnung" in the name, say — would be the guessing
 * this provider refuses everywhere else.
 */
const GAZETTE_SERIES = 'Amtliche Mitteilungen';

/**
 * OPUS states its licence in German prose, not SPDX. Only exact, verified
 * strings are mapped; anything unrecognised stays NOASSERTION rather than
 * being approximated, because a wrong licence is worse than an unread one.
 */
// Ordered most-specific first, and each code is bounded by a lookahead: the
// German prose puts " - " between the code and its explanation, so a pattern
// that merely forbade a hyphen would reject "CC BY - Namensnennung 4.0" while
// still needing to keep plain "CC BY" from swallowing "CC BY-NC-ND".
const LICENCE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/CC BY-NC-ND(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-NC-ND-4.0'],
  [/CC BY-NC-SA(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-NC-SA-4.0'],
  [/CC BY-NC(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-NC-4.0'],
  [/CC BY-SA(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-SA-4.0'],
  [/CC BY-ND(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-ND-4.0'],
  [/CC BY(?![-\w])[\s\S]*?4\.0/i, 'CC-BY-4.0'],
  [/CC0/i, 'CC0-1.0'],
];

export interface Opus4FrontdoorRecord {
  readonly docId: string;
  readonly url: string;
  readonly title: string;
  readonly abstract?: string;
  readonly series?: string;
  readonly seriesNumber?: string;
  readonly owner?: string;
  readonly editor?: string;
  readonly institute?: string;
  /** Beschlussdatum, ISO — the date the rule was decided, not uploaded. */
  readonly decisionDate?: string;
  readonly publishedDate?: string;
  readonly licence: string;
  readonly fulltextUrl?: string;
  readonly normativeForce: NormativeForce;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** "15.01.2026" → "2026-01-15"; "2026/01/21" → "2026-01-21"; else undefined. */
export function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const german = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (german) return `${german[3]}-${german[2]}-${german[1]}`;
  const slashed = value.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (slashed) return `${slashed[1]}-${slashed[2]}-${slashed[3]}`;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : undefined;
}

export function toSpdx(germanLicence: string | undefined): string {
  if (!germanLicence) return 'NOASSERTION';
  for (const [pattern, spdx] of LICENCE_MAP) {
    if (pattern.test(germanLicence)) return spdx;
  }
  return 'NOASSERTION';
}

/**
 * Whether the document changes another one rather than standing on its own.
 *
 * The gazette is full of these — "Vierte Änderung der Geschäftsordnung des
 * Akademischen Senats vom 05.12.2013". Indexed naively, an amendment answers
 * "what does the Geschäftsordnung say" with the text of a change list, which
 * is both wrong and confidently wrong. This flags them; deciding what the
 * corpus does about consolidation is a separate question.
 */
export function looksLikeAmendment(title: string): boolean {
  return /\b(?:\d+\.|erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte|neunte|zehnte)\s+änderung(?:s\w*)?\b/i
    .test(title);
}

/** The docIds linked from one Solr result page, in the order they appear. */
export function parseSearchResultIds(html: string): string[] {
  const $ = cheerio.load(html);
  const ids: string[] = [];
  $('a[href*="/frontdoor/"]').each((_, element) => {
    const match = /\/docId\/(\d+)/.exec($(element).attr('href') ?? '');
    if (match?.[1] && !ids.includes(match[1])) ids.push(match[1]);
  });
  return ids;
}

/**
 * Read one frontdoor page into declared metadata.
 *
 * Everything here is taken from the page's own labelled fields. Nothing is
 * inferred from the running text — the single derivation is `normativeForce`
 * from the series, justified above.
 */
export function parseFrontdoor(html: string, url: string): Opus4FrontdoorRecord {
  const $ = cheerio.load(html);

  const fields = new Map<string, string>();
  $('tr').each((_, row) => {
    const cells = $(row).children('th, td').toArray().map((cell) => normalise($(cell).text()));
    const [label, value] = cells;
    if (label && value && !fields.has(label)) {
      fields.set(label.replace(/:$/, ''), value);
    }
  });

  const docId = /\/docId\/(\d+)/.exec(url)?.[1] ?? '';
  const title = normalise($('h2').first().text()) || normalise($('title').text());
  const seriesRaw = fields.get('Series (Serial Number)');
  const series = seriesRaw?.split('(')[0]?.trim();
  const seriesNumber = seriesRaw ? /\(([^)]+)\)/.exec(seriesRaw)?.[1] : undefined;
  const fulltextPath = $('a[href*="/files/"]').first().attr('href');
  const abstract = normalise($('.abstract').first().text());

  const decisionDate = toIsoDate(fields.get('Decision date'));
  const publishedDate = toIsoDate(fields.get('Date of first Publication'))
    ?? toIsoDate(fields.get('Date of Publication (online)'));

  return {
    docId,
    url,
    title,
    licence: toSpdx(fields.get('Licence (German)') ?? fields.get('Licence')),
    normativeForce: series === GAZETTE_SERIES ? 'binding' : 'guidance',
    ...(abstract ? { abstract } : {}),
    ...(series ? { series } : {}),
    ...(seriesNumber ? { seriesNumber } : {}),
    ...(fields.get('Contributor(s)') ? { owner: fields.get('Contributor(s)')! } : {}),
    ...(fields.get('Editor') ? { editor: fields.get('Editor')! } : {}),
    ...(fields.get('Institutes') ? { institute: fields.get('Institutes')! } : {}),
    ...(decisionDate ? { decisionDate } : {}),
    ...(publishedDate ? { publishedDate } : {}),
    ...(fulltextPath
      ? { fulltextUrl: new URL(fulltextPath, url).toString() }
      : {}),
  };
}

/**
 * Turn parsed metadata plus the extracted full text into an ingest input.
 *
 * `body` is supplied by the caller rather than read here: the text lives in a
 * linked PDF, and how that PDF becomes Markdown is a separate concern from how
 * OPUS labels its records.
 *
 * `asOf` prefers the Beschlussdatum over the upload date. They differ by weeks
 * to months across the sample, and only one of them is the date the rule
 * actually took its current shape.
 */
export function toIngestInput(
  record: Opus4FrontdoorRecord,
  body: string,
): HausIngestInput {
  const asOf = record.decisionDate ?? record.publishedDate;
  const documentType = record.series ?? 'OPUS-Dokument';
  return {
    sourceId: OPUS4_SOURCE_ID,
    url: record.url,
    title: record.title,
    body,
    normativeForce: record.normativeForce,
    confidentiality: 'public',
    status: 'in-force',
    documentType,
    licence: record.licence,
    // Verbatim redistribution is what the CC licences on this corpus permit;
    // the conditions they attach — attribution, NC, ND — travel in `licence`,
    // which is the field a consumer must render anyway.
    redistribution: record.licence === 'NOASSERTION' ? 'unknown' : 'allowed',
    language: 'de',
    ...(asOf ? { asOf } : {}),
    ...(record.owner ?? record.editor
      ? { owner: record.owner ?? record.editor! }
      : {}),
  };
}
