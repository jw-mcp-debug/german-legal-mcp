import { parseReadingVersion } from './bht-web.js';

/**
 * Finding the consolidated Ordnungen, which nothing on the site lists.
 *
 * `/ordnungen` looks like the index and is not: it links promulgated PDFs under
 * `/fileadmin/…/amtliche_mitteilung/`, not the consolidated pages. The reading
 * versions sit wherever the responsible body's pages sit — `/589`, `/608`,
 * `/geschokura`, `/1004` — under opaque numeric ids and slugs that reveal
 * nothing.
 *
 * `sitemap.xml` closes the gap: 1.272 URLs, the complete German page set, every
 * known reading version among them. That makes link-following unnecessary —
 * one request replaces a breadth-first walk, and coverage becomes a fact rather
 * than a hope.
 *
 * What the sitemap does *not* give is a change signal. See `SitemapEntry.lastmod`.
 */

export interface SitemapEntry {
  readonly url: string;
  /**
   * Present, parsed, and deliberately not used to decide what to re-fetch.
   *
   * TYPO3 reports the page record's date, not its content elements'. Measured:
   * `/589` carries `lastmod` 2015-10-28 while the page itself states "in der
   * Fassung vom 16.07.2026" — three amendments and eleven years apart. Gating a
   * delta run on this field would skip precisely the pages that changed.
   *
   * Kept because the discrepancy is worth reporting, and because a site that
   * later starts maintaining the field would show it here first. Change
   * detection belongs to the content hash the index already stores.
   */
  readonly lastmod?: string;
  readonly priority?: number;
}

export interface RobotsRules {
  readonly disallow: readonly string[];
}

export type RejectionReason =
  | 'robots-disallowed'
  | 'fetch-failed'
  | 'no-content'
  | 'too-few-sections';

export interface ReadingVersionCandidate {
  readonly url: string;
  readonly title: string;
  readonly sectionCount: number;
  readonly asOf?: string;
  /** Whether the page calls itself a nichtamtliche Lesefassung in so many words. */
  readonly declaresReadingVersion: boolean;
  readonly lastmod?: string;
}

export interface DiscoveryRejection {
  readonly url: string;
  readonly reason: RejectionReason;
}

export interface DiscoveryReport {
  readonly candidates: readonly ReadingVersionCandidate[];
  readonly rejected: readonly DiscoveryRejection[];
  readonly visited: number;
}

/** Returns the page HTML, or null when it could not be fetched. */
export type PageFetcher = (url: string) => Promise<string | null>;

export interface DiscoveryOptions {
  readonly entries: readonly SitemapEntry[];
  readonly fetchPage: PageFetcher;
  readonly robots?: RobotsRules;
  /**
   * How many `§` headings make a page a rule rather than a page mentioning one.
   *
   * Three, from the sample: the four known reading versions carry 25, 17, 14
   * and 10, while ordinary pages that merely cite a paragraph carry none in
   * heading position. The margin is wide enough that the exact threshold is not
   * load-bearing — which is the point of choosing it from measurements rather
   * than from taste.
   */
  readonly minSections?: number;
  readonly onProgress?: (visited: number, total: number, url: string) => void;
}

const DEFAULT_MIN_SECTIONS = 3;

export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const url = /<loc>\s*([\s\S]*?)\s*<\/loc>/.exec(block)?.[1];
    if (!url) continue;
    const lastmod = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/.exec(block)?.[1];
    const priority = /<priority>\s*([\s\S]*?)\s*<\/priority>/.exec(block)?.[1];
    entries.push({
      url,
      ...(lastmod ? { lastmod } : {}),
      ...(priority ? { priority: Number(priority) } : {}),
    });
  }
  return entries;
}

/**
 * The `Disallow` prefixes that apply to us.
 *
 * Only the group matching `userAgent` and the wildcard group are read, and a
 * group ends at the next `User-agent` line. An empty `Disallow:` means "nothing
 * is disallowed" in the standard and must not become a prefix that matches
 * every path — which is what an unfiltered read of the value would produce.
 */
export function parseRobots(text: string, userAgent = '*'): RobotsRules {
  const disallow: string[] = [];
  let active = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      active = value === '*' || value.toLowerCase() === userAgent.toLowerCase();
      continue;
    }
    if (active && key === 'disallow' && value !== '') disallow.push(value);
  }
  return { disallow };
}

export function isAllowed(url: string, rules: RobotsRules): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return !rules.disallow.some((prefix) => path.startsWith(prefix));
}

/**
 * Decide whether one fetched page is a consolidated Ordnung.
 *
 * Structural, not lexical: a page qualifies by carrying its rule as `§`
 * headings, not by containing the word "Ordnung". Titles mislead in both
 * directions here — "Gebührenordnung" is a table with no `§` heading at all,
 * while `/geschokura` is a full Geschäftsordnung whose slug says almost nothing.
 */
export function classifyPage(
  html: string,
  url: string,
  minSections = DEFAULT_MIN_SECTIONS,
): ReadingVersionCandidate | RejectionReason {
  const page = parseReadingVersion(html, url);
  if (page.markdown.trim() === '') return 'no-content';
  if (page.sectionCount < minSections) return 'too-few-sections';
  return {
    url,
    title: page.title,
    sectionCount: page.sectionCount,
    declaresReadingVersion: page.declaresReadingVersion,
    ...(page.asOf ? { asOf: page.asOf } : {}),
  };
}

/**
 * Walk the sitemap and report what looks like a consolidated Ordnung.
 *
 * Reports rather than ingests. Ownership and the authoritative counterpart are
 * not on these pages, and a candidate list a person has looked at is where
 * those get supplied — ingesting first would bake in exactly the guesses this
 * provider refuses to make.
 *
 * Pacing belongs to `fetchPage`: this awaits each fetch in turn and starts no
 * concurrency of its own, so a fetcher that delays between calls makes the
 * whole run polite without this code knowing about it.
 */
export async function discoverReadingVersions(
  options: DiscoveryOptions,
): Promise<DiscoveryReport> {
  const {
    entries,
    fetchPage,
    robots = { disallow: [] },
    minSections = DEFAULT_MIN_SECTIONS,
    onProgress,
  } = options;

  const candidates: ReadingVersionCandidate[] = [];
  const rejected: DiscoveryRejection[] = [];
  let visited = 0;

  for (const entry of entries) {
    if (!isAllowed(entry.url, robots)) {
      rejected.push({ url: entry.url, reason: 'robots-disallowed' });
      continue;
    }

    visited += 1;
    onProgress?.(visited, entries.length, entry.url);

    let html: string | null;
    try {
      html = await fetchPage(entry.url);
    } catch {
      html = null;
    }
    if (html === null) {
      rejected.push({ url: entry.url, reason: 'fetch-failed' });
      continue;
    }

    const result = classifyPage(html, entry.url, minSections);
    if (typeof result === 'string') {
      rejected.push({ url: entry.url, reason: result });
      continue;
    }
    candidates.push({ ...result, ...(entry.lastmod ? { lastmod: entry.lastmod } : {}) });
  }

  candidates.sort((a, b) =>
    Number(b.declaresReadingVersion) - Number(a.declaresReadingVersion)
    || b.sectionCount - a.sectionCount);

  return { candidates, rejected, visited };
}

/** A review sheet: what to ingest, and what a person still has to supply. */
export function renderDiscoveryReport(report: DiscoveryReport): string {
  const counts = new Map<RejectionReason, number>();
  for (const { reason } of report.rejected) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [
    '# Lesefassungen — Fundbericht',
    '',
    `${report.candidates.length} Kandidat(en) aus ${report.visited} geprüften Seiten.`,
    '',
    '| Seite | §§ | Stand | Als Lesefassung ausgewiesen | sitemap lastmod |',
    '|---|---|---|---|---|',
    ...report.candidates.map((candidate) =>
      `| [${candidate.title}](${candidate.url}) | ${candidate.sectionCount} `
      + `| ${candidate.asOf ?? '—'} | ${candidate.declaresReadingVersion ? 'ja' : 'nein'} `
      + `| ${candidate.lastmod ?? '—'} |`),
    '',
    'Nicht übernommen: '
    + ([...counts].map(([reason, n]) => `${reason} ${n}`).join(', ') || 'nichts'),
    '',
    '> Vor dem Einlesen zu ergänzen, weil die Seiten es nicht sagen:',
    '> zuständiges Referat (`owner`) und die amtliche Fundstelle',
    '> (`authoritativeSource`) je Eintrag. Ein "nein" in der vierten Spalte',
    '> heißt nicht "amtlich" — keine Webseite ist der amtliche Text.',
  ].join('\n');
}
