import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

/**
 * Reading verwaltungsvorschriften-im-internet.de.
 *
 * The portal is the administrative-regulation counterpart to
 * gesetze-im-internet.de — same operator, same generation of markup, same
 * latin1 encoding. What it lacks is any structured interface: no XML table of
 * contents, no API, and a search that answers with document ids and nothing
 * else.
 *
 * That last point shapes the design. A hit list reading
 * `BMF-IIA3-20181002-H-05-01-2-KF-015-A009` tells a caller nothing, so titles
 * have to come from somewhere. They come from the per-ministry listings, which
 * pair every main document with its title and are small enough to hold locally.
 */

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export interface VwvIssuer {
  readonly name: string;
  readonly path: string;
}

export interface VwvIndexEntry {
  readonly docId: string;
  readonly title: string;
  readonly issuer: string;
  /** The regulation's short form — "ANBest-P", "NBest-WV" — where it has one. */
  readonly abbreviation?: string;
}

export interface VwvSearchHit {
  readonly docId: string;
  readonly snippet: string;
  /** The portal's own relevance, one to four stars. */
  readonly relevance: number;
}

export interface VwvSearchPage {
  readonly hits: readonly VwvSearchHit[];
  readonly total: number;
}

export interface VwvDocument {
  readonly docId: string;
  readonly title: string;
  readonly markdown: string;
  /** The regulation this document is an annex to, where it names one. */
  readonly parentTitle?: string;
  readonly parentDocId?: string;
}

/**
 * The portal double-encodes: its pages carry `&amp;#8211;` where an en dash
 * belongs. One decoding pass — cheerio's — leaves `&#8211;` standing in the
 * text, so a second pass over numeric references finishes the job.
 */
function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function clean(text: string): string {
  return decodeNumericEntities(text).replace(/\s+/g, ' ').trim();
}

/** `…/BMF-IIA3-…-A009.htm` → `BMF-IIA3-…-A009`. */
export function docIdFromHref(href: string): string | undefined {
  const match = /([^/]+)\.html?$/i.exec(href.trim());
  const id = match?.[1];
  if (!id || id === 'index' || id.startsWith('Teilliste')) return undefined;
  return id;
}

/** The ministries whose regulations the portal carries. */
export function parseIssuerList(html: string): VwvIssuer[] {
  const $ = cheerio.load(html);
  const issuers: VwvIssuer[] = [];
  $('a[href*="Teilliste"]').each((_, element) => {
    const path = $(element).attr('href')?.replace(/^\.\//, '');
    const name = clean($(element).text());
    if (path && name && !issuers.some((entry) => entry.path === path)) {
      issuers.push({ name, path });
    }
  });
  return issuers;
}

/**
 * One ministry's regulations, as title and document id.
 *
 * This listing is the only place the portal states a title next to an id. The
 * search does not, and the document pages put their id in the `h1` where a
 * title belongs.
 */
export function parseTeilliste(html: string, issuer: string): VwvIndexEntry[] {
  const $ = cheerio.load(html);
  const entries: VwvIndexEntry[] = [];

  $('a[href$=".htm"], a[href$=".html"]').each((_, element) => {
    const anchor = $(element);
    const docId = docIdFromHref(anchor.attr('href') ?? '');
    if (!docId || entries.some((entry) => entry.docId === docId)) return;

    const linkText = clean(anchor.text());

    // The listings come in two shapes. In one the link carries the full title.
    // In the other it carries only an <abbr> — "NBest-WV" — and the title
    // follows after a <br/> in the same paragraph. Reading only the link text
    // silently drops every regulation of the second kind, which is how a
    // Nebenbestimmung ends up in a hit list with no title at all.
    const paragraph = anchor.closest('p');
    const around = clean(paragraph.text());
    const trailing = clean(around.startsWith(linkText)
      ? around.slice(linkText.length)
      : around.replace(linkText, ' '));

    const abbreviation = clean(anchor.find('abbr').text()) || undefined;
    const title = trailing.length >= 12 ? trailing : linkText;

    // Navigation shares this markup, and its entries are single words.
    if (title.length < 12) return;
    entries.push({
      docId,
      title,
      issuer,
      ...(abbreviation ? { abbreviation } : {}),
    });
  });

  return entries;
}

export function parseSearchResults(html: string): VwvSearchPage {
  const $ = cheerio.load(html);
  const hits: VwvSearchHit[] = [];

  $('dl').each((_, element) => {
    const anchor = $(element).find('dt a').first();
    const docId = docIdFromHref(anchor.attr('href') ?? '');
    if (!docId) return;
    hits.push({
      docId,
      snippet: clean($(element).find('dd').text()).replace(/^\.{3}\s*/, ''),
      relevance: $(element).find('dt img[alt="*"]').length,
    });
  });

  const totalText = clean($('#paddingLR12 strong').first().text());
  const total = Number(/von\s+(\d+)\s+Treffer/.exec(totalText)?.[1] ?? hits.length);
  return { hits, total };
}

/**
 * One regulation, as Markdown.
 *
 * The real title is not in the `h1` — that carries the file name. It sits in
 * the first bold paragraph of the content, after an optional link to the parent
 * regulation. Both are read here, and the parent link is removed from the body
 * so the text starts at the regulation itself.
 */
export function parseDocument(html: string, docId: string): VwvDocument {
  const $ = cheerio.load(html);
  const content = $('#paddingLR12').first();

  const parentAnchor = content.find('linkanzeigen a, a[href*="bsvwvbund"]').first();
  const parentRaw = clean(parentAnchor.text());
  const parentTitle = parentRaw.replace(/^Zum Hauptdokument\s*:\s*/i, '') || undefined;
  const parentDocId = docIdFromHref(parentAnchor.attr('href') ?? '');
  parentAnchor.closest('p').remove();

  // Titles are set across several lines — "Anlage 1 zur VV Nr. 5.1 zu § 44 BHO"
  // above the regulation's own name. `.text()` welds them into
  // "§ 44 BHOAllgemeine Nebenbestimmungen", so the breaks become separators
  // first. Done on the DOM rather than on the markup, because stripping tags
  // from `.html()` also skips entity decoding and leaves `&nbsp;` in the title.
  const titleNode = content.find('strong').first();
  titleNode.find('br').replaceWith(' | ');
  const title = clean(titleNode.text())
    .replace(/(?:\s*\|\s*)+/g, ' — ')
    .replace(/^\s*—\s*|\s*—\s*$/g, '')
    .trim() || docId;

  const markdown = turndown
    .turndown(content.html() ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    docId,
    title,
    markdown,
    ...(parentTitle ? { parentTitle } : {}),
    ...(parentDocId && parentDocId !== docId ? { parentDocId } : {}),
  };
}
