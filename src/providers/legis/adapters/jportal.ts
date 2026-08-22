import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import {
  jportalSearch,
  jportalGetDocument,
  jportalPermalink,
  JPORTAL_STATES,
  type JPortalSearchResult,
  type JPortalDocument,
} from '../../../shared/clients/jportal.js';
import type { LegisAdapter, SearchResult, LegisEntry, TocEntry } from '../types.js';
import { rankSearchResults, type RankableSearchResult } from './search-ranking.js';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const JPORTAL_SECTION_SUFFIX = /NN\d{8,12}$/;
const SEARCH_EXPANSION_FACTOR = 20;
const MAX_SEARCH_RESULTS_TO_RERANK = 200;
/**
 * R3 marks the version of a norm that is currently in force with docPart "S"
 * and every superseded version of the same norm with lowercase "s". Retrieval
 * does not need the distinction — the docId already identifies the version, and
 * a superseded norm answers to "S" just as well — but a result list does: a
 * search for "§ 110 BerlHG" returns the in-force text once and its five earlier
 * fassungen alongside it, and picking whichever came first put a repealed text
 * in front of the reader.
 */
const IN_FORCE_DOC_PART = 'S';
/** Full text of a law, as opposed to "S", the framing document with its metadata. */
const FULL_LAW_DOC_PART = 'X';
/**
 * The full-law document is the only place the section ids are published, and it
 * is large — 673 KB for the BerlHG. Both `toc` and a law-level `get` need it,
 * and a reader typically calls them in sequence on the same law, so it is held
 * for an hour rather than fetched twice. The Länder portals disallow automated
 * agents in robots.txt; asking them once per law per hour is the least this
 * adapter can do about that.
 */
const FULL_LAW_TTL_MS = 60 * 60 * 1000;
const SECTION_TITLE = /^(§{1,2}\s*\S+|Art\.?\s*\S+|Artikel\s*\S+)\s*[-–—]\s*(.*)$/;
const STRUCTURAL_HEADING = /\b(Abschnitt|Kapitel|Teil|Buch|Titel|Untertitel|Anlage)\b/;

interface JPortalRankableResult extends RankableSearchResult {
  /** Root document of the law this hit belongs to; sections group under it. */
  readonly lawId: string;
  /** Identifies one norm across its fassungen, e.g. "110 berlhg". Empty for a law. */
  readonly sectionKey: string;
  readonly inForce: boolean;
}

function extractMetadata(headHtml: string): string {
  const $ = cheerio.load(headHtml);
  const pairs: string[] = [];
  $('th').each((_, th) => {
    const key = $(th).text().trim().replace(/:$/, '');
    const val = $(th).next('td').text().trim();
    if (key && val) pairs.push(`**${key}:** ${val}`);
  });
  return pairs.join('  \n');
}

function rootDocId(docId: string): string {
  return docId.replace(JPORTAL_SECTION_SUFFIX, '');
}

function isRootDocument(docId: string): boolean {
  return rootDocId(docId) === docId;
}

function normalizeSpace(value: string): string {
  // Section numbers arrive as "\u00a0110" — a non-breaking space, which
  // `\s` matches, so collapsing whitespace also normalizes them.
  return value.replace(/\s+/g, ' ').trim();
}

function extractRootTitle(result: JPortalSearchResult): string {
  if (isRootDocument(result.docId)) return result.title;

  const parts = result.subtitle.split('|').map((part) => part.trim()).filter(Boolean);
  const lawTitle = parts.find((part) => (
    !part.startsWith('-') &&
    !part.startsWith('gültig') &&
    !part.startsWith('Landesnorm') &&
    /(?:gesetz|verordnung|satzung|ordnung|gesetzbuch|staatsvertrag|bekanntmachung)/i.test(part)
  ));

  return lawTitle ?? result.title;
}

function toRankableResult(result: JPortalSearchResult): JPortalRankableResult {
  const lawId = rootDocId(result.docId);
  const isRoot = isRootDocument(result.docId);
  const lawTitle = extractRootTitle(result);

  return {
    // The portal's own docId, section suffix intact. Stripping it to `lawId`
    // here is what left `legis:get` unable to reach a single norm: every hit in
    // a law collapsed onto one id, and that id resolves to the framing document.
    id: result.docId,
    title: result.title,
    subtitle: result.subtitle,
    date: result.date,
    rankText: `${lawTitle} ${result.title} ${result.subtitle}`,
    isRootDocument: isRoot,
    lawId,
    sectionKey: isRoot ? '' : normalizeSpace(result.title).toLowerCase(),
    inForce: result.docPart === IN_FORCE_DOC_PART,
  };
}

/**
 * One row per norm, not per fassung — and none at all for a law whose own root
 * document is among the hits, since that document already stands for its
 * sections. Superseded fassungen are counted rather than listed; their docIds
 * stay reachable through the portal, and listing six near-identical rows for
 * one § would crowd out every other law in a ten-result page.
 */
function collapseToDistinctNorms(
  results: readonly JPortalRankableResult[],
): JPortalRankableResult[] {
  const lawsMatchedAsRoot = new Set(
    results.filter((result) => result.isRootDocument === true).map((result) => result.lawId),
  );

  const groups = new Map<string, JPortalRankableResult[]>();
  for (const result of results) {
    const isSection = result.isRootDocument !== true;
    if (isSection && lawsMatchedAsRoot.has(result.lawId)) continue;
    const key = isSection ? `${result.lawId}::${result.sectionKey}` : result.lawId;
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }

  return [...groups.values()].map((group) => {
    const representative = group.find((result) => result.inForce) ?? group[0]!;
    const superseded = group.length - 1;
    if (superseded < 1) return representative;
    return {
      ...representative,
      subtitle: `${representative.subtitle} | +${superseded} superseded ${superseded === 1 ? 'version' : 'versions'}`,
    };
  });
}

function toSearchResult(result: JPortalRankableResult, state: string): SearchResult {
  const url = jportalPermalink(state, result.id);
  return {
    id: result.id,
    title: result.title,
    subtitle: result.subtitle,
    date: result.date,
    ...(url ? { url } : {}),
  };
}

/** Drops the three permalink blocks the framing document ends in; they are boilerplate. */
function withoutPermalinkBlocks(markdown: string): string {
  const permalink = markdown.search(/^#{1,6}\s*Permalink\s*$/m);
  return (permalink === -1 ? markdown : markdown.slice(0, permalink)).trimEnd();
}

/**
 * jPortal renders a law's "Nichtamtliches Inhaltsverzeichnis" as a two-column
 * table — title, valid-from — in which every title links to the norm's own
 * docId. That makes it the one place where the ids of all sections of a law can
 * be read in a single request, so the entries this returns are addressable:
 * each `id` goes straight back into `legis:get`.
 */
function parseTableOfContents(html: string, lawId: string): TocEntry[] {
  const $ = cheerio.load(html);
  const entries: TocEntry[] = [];

  $('.jwsinhaltsverzeichnis table tr').each((_, row) => {
    const cell = $(row).find('td').first();
    if (cell.length === 0) return;

    const link = cell.find('a[data-juris-link]').first().attr('data-juris-link');
    if (!link) return;

    let docId: string | undefined;
    try {
      const meta = JSON.parse(link) as { linkMeta?: { anchor?: string } };
      docId = meta.linkMeta?.anchor;
    } catch {
      return; // A row whose link payload does not parse is not addressable.
    }
    // The table opens with the law itself; it is the argument, not an entry.
    if (!docId || docId === lawId) return;

    const text = normalizeSpace(cell.text());
    if (!text) return;

    const section = SECTION_TITLE.exec(text);
    if (section) {
      entries.push({ depth: 1, num: normalizeSpace(section[1]!), title: section[2]!.trim(), id: docId });
      return;
    }
    entries.push({
      depth: STRUCTURAL_HEADING.test(text) ? 0 : 1,
      num: '',
      title: text,
      id: docId,
    });
  });

  return entries;
}

export class JPortalAdapter implements LegisAdapter {
  readonly states = JPORTAL_STATES;

  private readonly fullLaws = new Map<string, { fetchedAt: number; document: JPortalDocument }>();

  async search(state: string, query: string, limit: number): Promise<SearchResult[]> {
    const expandedLimit = Math.min(MAX_SEARCH_RESULTS_TO_RERANK, Math.max(limit, limit * SEARCH_EXPANSION_FACTOR));
    const results = await jportalSearch(state, query, expandedLimit);
    const collapsed = collapseToDistinctNorms(results.map(toRankableResult));
    return rankSearchResults(collapsed, query, limit).map((r) => toSearchResult(r, state));
  }

  async get(state: string, id: string): Promise<LegisEntry> {
    const doc = await jportalGetDocument(state, id);
    if (isRootDocument(id)) {
      const law = await this.renderLaw(state, id, doc);
      if (law) return law;
    }

    const metadata = extractMetadata(doc.head);
    const $ = cheerio.load(doc.text);
    // Remove internal navigation anchors and empty tags
    $('a[name]').not('[href]').remove();
    $('comment, .docLayoutNavigation').remove();
    $('h1 br, h2 br, h3 br, h4 br').replaceWith(' ');
    const content = turndown.turndown($.html() || '');

    return {
      title: doc.title,
      content: metadata ? `${metadata}\n\n---\n\n${content}` : content,
      url: doc.permalink,
    };
  }

  /**
   * A law's masthead and the sections it contains — not its full text.
   *
   * The framing document alone, which is what this used to return, is 2,6 KB of
   * Fundstelle and permalinks: correct, and useless to someone who asked for the
   * law. Joining every section instead would produce a document nobody asked
   * for, so this follows the federal adapter and answers with the masthead plus
   * a section list. Each entry carries its own id, so the list is a directory
   * rather than a promise; the section texts come from `get` on those ids.
   *
   * Returns undefined when the law publishes no linked contents — a short
   * Verordnung often does not — and the caller then renders the framing
   * document as before rather than an empty list.
   */
  private async renderLaw(
    state: string,
    lawId: string,
    framing: JPortalDocument,
  ): Promise<LegisEntry | undefined> {
    const entries = await this.toc(state, lawId);
    if (entries.length === 0) return undefined;

    const $ = cheerio.load(framing.text);
    $('a[name]').not('[href]').remove();
    $('comment, .docLayoutNavigation').remove();
    const preamble = withoutPermalinkBlocks(turndown.turndown($.html() || ''));
    const metadata = extractMetadata(framing.head);

    const sections = entries.map((entry) => {
      const label = [entry.num, entry.title].filter(Boolean).join(' ');
      const indent = '  '.repeat(entry.depth);
      return entry.id ? `${indent}- ${label} — \`${entry.id}\`` : `${indent}- ${label}`;
    });

    return {
      title: framing.title,
      content: [
        ...(metadata ? [metadata, '', '---', ''] : []),
        ...(preamble ? [preamble, ''] : []),
        '## Inhaltsübersicht',
        '',
        ...sections,
      ].join('\n'),
      url: framing.permalink,
    };
  }

  async toc(state: string, id: string): Promise<TocEntry[]> {
    const lawId = rootDocId(id);
    const doc = await this.fullLawDocument(state, lawId);
    return parseTableOfContents(doc.text, lawId);
  }

  private async fullLawDocument(state: string, lawId: string): Promise<JPortalDocument> {
    const key = `${state}:${lawId}`;
    const cached = this.fullLaws.get(key);
    if (cached && Date.now() - cached.fetchedAt < FULL_LAW_TTL_MS) return cached.document;

    const document = await jportalGetDocument(state, lawId, FULL_LAW_DOC_PART);
    this.fullLaws.set(key, { fetchedAt: Date.now(), document });
    return document;
  }
}
