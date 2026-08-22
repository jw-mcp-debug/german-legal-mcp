import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  docIdFromHref,
  parseDocument,
  parseIssuerList,
  parseSearchResults,
  parseTeilliste,
} from './parser.js';

const FIXTURES = join(process.cwd(), 'src/providers/vwv/__fixtures__');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

describe('docIdFromHref', () => {
  it('reads the id off a document link', () => {
    expect(docIdFromHref('./bsvwvbund_28032011_BMF.htm')).toBe('bsvwvbund_28032011_BMF');
    expect(docIdFromHref('https://www.verwaltungsvorschriften-im-internet.de/BMF-IIA3-A009.htm'))
      .toBe('BMF-IIA3-A009');
  });

  it('rejects the links that are not documents', () => {
    expect(docIdFromHref('index.html')).toBeUndefined();
    expect(docIdFromHref('./Teilliste_Bundeskanzleramt.html')).toBeUndefined();
    expect(docIdFromHref('')).toBeUndefined();
  });
});

describe('parseIssuerList', () => {
  it('lists the ministries the portal carries', () => {
    const issuers = parseIssuerList(fixture('erlassstellen.html'));
    expect(issuers.length).toBeGreaterThan(10);
    expect(issuers.map((i) => i.name)).toContain('Bundesministerium der Finanzen');
    expect(issuers.find((i) => i.name === 'Bundesministerium der Finanzen')?.path)
      .toBe('Teilliste_Bundesministerium_der_Finanzen.html');
  });
});

describe('parseTeilliste', () => {
  const entries = parseTeilliste(fixture('teilliste-bmf.html'), 'Bundesministerium der Finanzen');

  it('pairs every regulation with its title', () => {
    // The only place on the portal where a title stands next to an id: the
    // search returns ids alone, and document pages put the file name in the h1.
    expect(entries.length).toBeGreaterThan(30);
    const bho = entries.find((e) => e.title.includes('Gruppierungsplan'));
    expect(bho?.docId).toMatch(/^bsvwvbund_/);
    expect(bho?.issuer).toBe('Bundesministerium der Finanzen');
  });

  it('leaves the navigation out', () => {
    expect(entries.map((e) => e.title)).not.toContain('Startseite');
    expect(entries.map((e) => e.title)).not.toContain('Titelsuche');
  });

  it('reports each document once', () => {
    const ids = entries.map((e) => e.docId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseTeilliste — the second listing shape', () => {
  const entries = parseTeilliste(
    fixture('teilliste-bmfsfj.html'),
    'Bundesministerium für Familie, Senioren, Frauen und Jugend',
  );

  it('reads the title that follows the abbreviation link', () => {
    // Here the link carries only an <abbr> — "NBest-WV" — and the title comes
    // after a <br/>. Taking the link text as the title drops these entirely,
    // which is how a Nebenbestimmung reaches a hit list with no title.
    const nbest = entries.find((e) => e.docId === 'bsvwvbund_16122002_212');
    expect(nbest?.title).toContain('Nebenbestimmungen für Zuwendungen');
    expect(nbest?.abbreviation).toBe('NBest-WV');
  });

  it('captures abbreviations, which is what people search by', () => {
    expect(entries.filter((e) => e.abbreviation !== undefined).length).toBeGreaterThan(3);
  });

  it('still reads the shape where the link holds the title', () => {
    const bmf = parseTeilliste(fixture('teilliste-bmf.html'), 'BMF');
    expect(bmf.length).toBeGreaterThan(30);
    expect(bmf.every((e) => e.title.length >= 12)).toBe(true);
  });
});

describe('parseSearchResults', () => {
  const page = parseSearchResults(fixture('suchergebnis.html'));

  it('reads hits, their snippets and the portal total', () => {
    expect(page.total).toBe(6);
    expect(page.hits).toHaveLength(6);
    expect(page.hits[0]?.docId).toBe('BMF-IIA2-21122017-H-08-10-KF-001-A003');
    expect(page.hits[0]?.snippet).toContain('Nebenbestimmungen');
  });

  it('carries the portal\'s own relevance stars', () => {
    expect(page.hits[0]?.relevance).toBeGreaterThan(0);
    expect(page.hits[0]?.relevance).toBeLessThanOrEqual(4);
  });

  it('finishes the portal\'s double encoding', () => {
    // Its pages carry "&amp;#8211;" where an en dash belongs; one decoding pass
    // leaves "&#8211;" standing in the text a caller reads.
    expect(page.hits.map((h) => h.snippet).join(' ')).not.toContain('&#');
  });

  it('returns nothing for a result page with no hits', () => {
    expect(parseSearchResults('<html><body>Keine Treffer</body></html>').hits).toEqual([]);
  });
});

describe('parseDocument', () => {
  const doc = parseDocument(fixture('dokument-anbest-i.html'), 'BMF-IIA3-20181002-H-05-01-2-KF-015-A009');

  it('takes the title from the content, not from the h1 that holds the file name', () => {
    expect(doc.title).toContain('ANBest-I');
    expect(doc.title).not.toMatch(/\.htm$/);
  });

  it('separates the title lines instead of welding them together', () => {
    // The heading is set over several lines; `.text()` produced
    // "§ 44 BHOAllgemeine Nebenbestimmungen".
    expect(doc.title).not.toMatch(/BHOAllgemeine/);
    expect(doc.title).toContain(' — ');
  });

  it('names the regulation this document is an annex to', () => {
    expect(doc.parentTitle).toContain('Bundeshaushaltsordnung');
    expect(doc.parentTitle).not.toMatch(/^Zum Hauptdokument/);
    expect(doc.parentDocId).toMatch(/^bsvwvbund_/);
  });

  it('converts the body to Markdown and starts it at the regulation', () => {
    expect(doc.markdown).toContain('Nebenbestimmungen im Sinne des § 36');
    expect(doc.markdown).not.toContain('Zum Hauptdokument');
    expect(doc.markdown).not.toContain('<div');
  });

  it('falls back to the id when a page states no title', () => {
    expect(parseDocument('<html><body><div id="paddingLR12"></div></body></html>', 'X-1').title)
      .toBe('X-1');
  });
});
