import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { HausIngestInput } from '../ingest.js';

export const WEB_SOURCE_ID = 'bht-web';

/**
 * The TYPO3 content frames that hold the actual Ordnung.
 *
 * Everything outside them is navigation, and the site carries a great deal of
 * it — the four sampled pages run 110-130 KB of which 8-21 KB is the text. A
 * whole-page conversion would bury a Geschäftsordnung in menu entries and make
 * every BM25 query match every page.
 */
const CONTENT_SELECTOR = '.frame-type-text';

/**
 * Marks a page that says outright what it is. Its absence is not evidence of
 * the opposite: `parseReadingVersion` treats every web page as a reading
 * version regardless, because the promulgation happens in the gazette and a
 * web rendering cannot be the official text however it is labelled.
 */
const READING_VERSION_MARKER = /nichtamtliche\s+lesefassung/i;

export interface BhtWebPage {
  readonly url: string;
  readonly title: string;
  readonly markdown: string;
  /** "in der Fassung vom 16.07.2026" → the consolidation date, ISO. */
  readonly asOf?: string;
  /** Whether the page declares itself a reading version in so many words. */
  readonly declaresReadingVersion: boolean;
  /** Count of `§` headings — a quick check that the extraction found the rule. */
  readonly sectionCount: number;
}

function createTurndown(): TurndownService {
  return new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
}

/** "16.07.2026" → "2026-07-16". */
function toIsoDate(value: string): string | undefined {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value);
  if (!match) return undefined;
  return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
}

/**
 * Read one consolidated Ordnung page into Markdown plus what it states about
 * itself. Nothing about ownership or binding force is inferred here — the site
 * declares neither, and both come from the source manifest.
 */
export function parseReadingVersion(html: string, url: string): BhtWebPage {
  const $ = cheerio.load(html);
  const frames = $(CONTENT_SELECTOR);
  const container = frames.length > 0 ? frames : $('main');

  const headings = container.find('h2, h3')
    .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get();
  const sectionCount = headings.filter((heading) => heading.startsWith('§')).length;

  const title = headings[0] ?? $('h1').first().text().replace(/\s+/g, ' ').trim();
  const plain = container.text().replace(/\s+/g, ' ');
  const fassung = /in der Fassung vom\s*([\d.]+)/i.exec(plain);
  const asOf = fassung?.[1] ? toIsoDate(fassung[1]) : undefined;

  const turndown = createTurndown();
  const markdown = container
    .map((_, element) => turndown.turndown($.html(element) ?? ''))
    .get()
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    url,
    title,
    markdown,
    declaresReadingVersion: READING_VERSION_MARKER.test(plain),
    sectionCount,
    ...(asOf ? { asOf } : {}),
  };
}

export interface ReadingVersionManifestEntry {
  readonly url: string;
  /** Declared, never sniffed — the site says nothing about who maintains a page. */
  readonly owner?: string;
  readonly documentType?: string;
  /** Where the promulgated text lives, so the banner can point at it. */
  readonly authoritativeSource?: string;
}

/**
 * Turn a parsed page into an ingest input.
 *
 * `authority` is fixed to `reading-version` and is not a parameter. A caller
 * cannot promote a web page to the official text by passing a flag, because no
 * web page is the official text — the Amtliche Mitteilungen are, and OPUS is
 * where those come from.
 */
export function toIngestInput(
  page: BhtWebPage,
  entry: ReadingVersionManifestEntry,
): HausIngestInput {
  return {
    sourceId: WEB_SOURCE_ID,
    url: page.url,
    title: page.title,
    body: page.markdown,
    // The rule itself binds; that this rendering of it is unofficial is what
    // `authority` records, one axis over.
    normativeForce: 'binding',
    authority: 'reading-version',
    confidentiality: 'public',
    status: 'in-force',
    language: 'de',
    licence: 'NOASSERTION',
    redistribution: 'unknown',
    ...(page.asOf ? { asOf: page.asOf } : {}),
    ...(entry.owner ? { owner: entry.owner } : {}),
    ...(entry.documentType ? { documentType: entry.documentType } : {}),
    ...(entry.authoritativeSource
      ? { authoritativeSource: entry.authoritativeSource }
      : {}),
  };
}
