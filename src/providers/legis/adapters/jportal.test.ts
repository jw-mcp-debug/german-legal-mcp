import { describe, expect, it, vi, beforeEach } from 'vitest';

const { jportalSearch, jportalGetDocument } = vi.hoisted(() => ({
  jportalSearch: vi.fn(),
  jportalGetDocument: vi.fn(),
}));
vi.mock('../../../shared/clients/jportal.js', () => ({
  jportalSearch,
  jportalGetDocument,
  JPORTAL_STATES: ['HE', 'RP'],
}));

import { JPortalAdapter } from './jportal.js';

beforeEach(() => { jportalSearch.mockReset(); jportalGetDocument.mockReset(); });

describe('JPortalAdapter', () => {
  it('reranks and deduplicates jPortal section hits to root laws', async () => {
    jportalSearch.mockResolvedValue([
      {
        docId: 'jlr-FooNN00000000003',
        title: '§ 2 HGes',
        subtitle: 'Landesnorm Hessen | - Einzelregel | Hessisches Gesetz (HGes) vom 1. Januar 2020 | gültig ab: 2020',
        date: '2020-01-01',
      },
      {
        docId: 'jlr-Foo',
        title: 'HGes',
        subtitle: 'Landesnorm Hessen | Hessisches Gesetz (HGes) vom 1. Januar 2020 | gültig ab: 2020',
        date: '2020-01-01',
      },
    ]);

    const results = await new JPortalAdapter().search('HE', 'HGes', 5);

    expect(jportalSearch).toHaveBeenCalledWith('HE', 'HGes', 100);
    expect(results).toEqual([
      {
        id: 'jlr-Foo',
        title: 'HGes',
        subtitle: 'Landesnorm Hessen | Hessisches Gesetz (HGes) vom 1. Januar 2020 | gültig ab: 2020',
        date: '2020-01-01',
      },
    ]);
  });

  it('keeps the section docId when a law is only matched through its sections', async () => {
    jportalSearch.mockResolvedValue([
      {
        docId: 'jlr-FooNN00000000353',
        title: '§ 110 HGes',
        subtitle: 'Landesnorm Hessen | - Mitarbeiter | Hessisches Gesetz (HGes) vom 1. Januar 2020 | gültig ab: 04.02.2026',
        date: '2026-02-04',
        docPart: 'S',
      },
    ]);

    const results = await new JPortalAdapter().search('HE', '§ 110 HGes', 5);

    expect(results).toHaveLength(1);
    // The suffix is what makes the norm retrievable; stripping it to `jlr-Foo`
    // resolves to the law's framing document instead of § 110.
    expect(results[0]!.id).toBe('jlr-FooNN00000000353');
    expect(results[0]!.title).toBe('§ 110 HGes');
  });

  it('collapses fassungen of one norm onto the one in force and counts the rest', async () => {
    const fassung = (suffix: string, docPart: string, validity: string) => ({
      docId: `jlr-FooNN000000003${suffix}`,
      title: '§ 110 HGes',
      subtitle: `Landesnorm Hessen | - Mitarbeiter | Hessisches Gesetz (HGes) vom 1. Januar 2020 | ${validity}`,
      date: '2020-01-01',
      docPart,
    });
    // Superseded fassungen come back first, as the portal orders them.
    jportalSearch.mockResolvedValue([
      fassung('52', 's', 'gültig ab: 17.07.2022 gültig bis: 03.02.2026'),
      fassung('51', 's', 'gültig ab: 25.09.2021 gültig bis: 16.07.2022'),
      fassung('53', 'S', 'gültig ab: 04.02.2026'),
    ]);

    const results = await new JPortalAdapter().search('HE', '§ 110 HGes', 5);

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('jlr-FooNN00000000353'); // docPart "S", not first
    expect(results[0]!.subtitle).toContain('+2 superseded versions');
  });

  it('keeps distinct norms of the same law apart', async () => {
    jportalSearch.mockResolvedValue([
      {
        docId: 'jlr-FooNN00000000353',
        title: '§ 110 HGes',
        subtitle: 'Landesnorm Hessen | - Mitarbeiter | Hessisches Gesetz (HGes) | gültig ab: 2026',
        date: '2026-01-01',
        docPart: 'S',
      },
      {
        docId: 'jlr-FooNN00000000356',
        title: '§ 110a HGes',
        subtitle: 'Landesnorm Hessen | - Lektoren | Hessisches Gesetz (HGes) | gültig ab: 2026',
        date: '2026-01-01',
        docPart: 'S',
      },
    ]);

    const results = await new JPortalAdapter().search('HE', 'HGes Mitarbeiter Lektoren', 5);

    expect(results.map((result) => result.id).sort()).toEqual([
      'jlr-FooNN00000000353',
      'jlr-FooNN00000000356',
    ]);
  });

  it('prepends parsed metadata to the rendered document body', async () => {
    jportalGetDocument.mockResolvedValue({
      head: '<table><tr><th>Gültig ab:</th><td>2020</td></tr></table>',
      text: '<h2>§ 1</h2><p>Inhalt.</p>',
      title: 'Hessisches Gesetz',
      permalink: 'https://example.test/jlr-Foo',
    });

    const entry = await new JPortalAdapter().get('HE', 'jlr-Foo');

    expect(entry.title).toBe('Hessisches Gesetz');
    expect(entry.content).toContain('**Gültig ab:** 2020'); // metadata block
    expect(entry.content).toContain('§ 1');
    expect(entry.content).toContain('---'); // separator between metadata and body
    expect(entry.url).toBe('https://example.test/jlr-Foo');
  });

  it('omits the metadata block when the head has no key/value rows', async () => {
    jportalGetDocument.mockResolvedValue({
      head: '<table></table>', text: '<p>Body.</p>', title: 'T', permalink: 'u',
    });
    const entry = await new JPortalAdapter().get('RP', 'x');
    expect(entry.content).not.toContain('---');
    expect(entry.content).toContain('Body');
  });

  it('answers a law-level id with its masthead and section list, not just the framing document', async () => {
    const link = JSON.stringify({ linkMeta: { docId: 'jlr-Foo', part: 'X', anchor: 'jlr-FooNN00000000014' } })
      .replace(/"/g, '&#34;');
    jportalGetDocument.mockResolvedValue({
      head: '<table><tr><th>Amtliche Abkürzung:</th><td>HGes</td></tr></table>',
      text: '<div class="jwsinhaltsverzeichnis"><table>'
        + `<tr><td><a data-juris-link="${link}">§\u00a01 - Geltungsbereich</a></td><td>2020</td></tr>`
        + '</table></div>',
      title: 'HGes',
      permalink: 'https://example.test/jlr-Foo',
    });

    const entry = await new JPortalAdapter().get('HE', 'jlr-Foo');

    expect(entry.content).toContain('**Amtliche Abkürzung:** HGes');
    expect(entry.content).toContain('## Inhaltsübersicht');
    // The id is what makes the list a directory rather than a promise.
    expect(entry.content).toContain('- § 1 Geltungsbereich — `jlr-FooNN00000000014`');
  });

  it('falls back to the framing document for a law without linked contents', async () => {
    jportalGetDocument.mockResolvedValue({
      head: '<table><tr><th>Gültig bis:</th><td>03.02.2026</td></tr></table>',
      text: '<p>Aufgehobene Verordnung ohne Inhaltsverzeichnis.</p>',
      title: 'MAVO',
      permalink: 'u',
    });

    const entry = await new JPortalAdapter().get('BE', 'jlr-Bar');

    expect(entry.content).not.toContain('## Inhaltsübersicht');
    expect(entry.content).toContain('Aufgehobene Verordnung');
  });

  describe('toc', () => {
    // Shape of the real "Nichtamtliches Inhaltsverzeichnis": a two-column table
    // whose titles link to each norm's own docId through a JSON link payload.
    const row = (docId: string, title: string, validFrom: string) => {
      const link = JSON.stringify({ linkMeta: { docId: 'jlr-Foo', part: 'X', anchor: docId } })
        .replace(/"/g, '&#34;');
      return `<tr><td><a data-juris-gui="link" data-juris-link="${link}">${title}</a></td>`
        + `<td><a data-juris-link="${link}">${validFrom}</a></td></tr>`;
    };
    const TOC_HTML =
      '<div class="jwsinhaltsverzeichnis"><h4>Nichtamtliches Inhaltsverzeichnis</h4></div>'
      + '<div class="jwsinhaltsverzeichnis"><table><thead><tr><th>Titel</th><th>Gültig ab</th></tr></thead>'
      + row('jlr-Foo', 'Hessisches Gesetz (HGes) vom 1. Januar 2020', '01.01.2020')
      + row('jlr-FooNN00000000012', 'Erster Abschnitt - Einleitende Vorschriften', '01.01.2020')
      + row('jlr-FooNN00000000014', '§\u00a01 - Geltungsbereich', '25.09.2021')
      + row('jlr-FooNN00000000353', '§\u00a0110 - Mitarbeiter und Mitarbeiterinnen', '04.02.2026')
      + '</table></div>'
      // The law's own body repeats its headings without links; those rows are
      // not addressable and must not reach the table of contents.
      + '<div class="docLayout"><table><tr><td>§ 110</td><td>Mitarbeiter</td></tr></table></div>';

    it('reads the linked table of contents into addressable entries', async () => {
      jportalGetDocument.mockResolvedValue({
        head: '', text: TOC_HTML, title: 'HGes', permalink: 'https://example.test/jlr-Foo',
      });

      const entries = await new JPortalAdapter().toc('HE', 'jlr-Foo');

      expect(jportalGetDocument).toHaveBeenCalledWith('HE', 'jlr-Foo', 'X');
      expect(entries).toEqual([
        { depth: 0, num: '', title: 'Erster Abschnitt - Einleitende Vorschriften', id: 'jlr-FooNN00000000012' },
        { depth: 1, num: '§ 1', title: 'Geltungsbereich', id: 'jlr-FooNN00000000014' },
        { depth: 1, num: '§ 110', title: 'Mitarbeiter und Mitarbeiterinnen', id: 'jlr-FooNN00000000353' },
      ]);
    });

    it('reads a section id as its law, so a search hit can be expanded', async () => {
      jportalGetDocument.mockResolvedValue({
        head: '', text: TOC_HTML, title: 'HGes', permalink: 'https://example.test/jlr-Foo',
      });

      await new JPortalAdapter().toc('HE', 'jlr-FooNN00000000353');

      expect(jportalGetDocument).toHaveBeenCalledWith('HE', 'jlr-Foo', 'X');
    });

    it('serves a second reader from the cache instead of refetching the law', async () => {
      jportalGetDocument.mockResolvedValue({
        head: '', text: TOC_HTML, title: 'HGes', permalink: 'u',
      });
      const adapter = new JPortalAdapter();

      await adapter.toc('HE', 'jlr-Foo');
      await adapter.toc('HE', 'jlr-FooNN00000000353');

      // Same law, one request: the full-law document is 673 KB for the BerlHG.
      expect(jportalGetDocument).toHaveBeenCalledTimes(1);
    });

    it('keeps the cache per state, so two portals are not confused', async () => {
      jportalGetDocument.mockResolvedValue({
        head: '', text: TOC_HTML, title: 'HGes', permalink: 'u',
      });
      const adapter = new JPortalAdapter();

      await adapter.toc('HE', 'jlr-Foo');
      await adapter.toc('RP', 'jlr-Foo');

      expect(jportalGetDocument).toHaveBeenCalledTimes(2);
    });

    it('returns nothing rather than guessing when the law publishes no linked contents', async () => {
      jportalGetDocument.mockResolvedValue({
        head: '', text: '<div class="docLayout"><p>Kurzes Gesetz ohne Inhaltsverzeichnis.</p></div>',
        title: 'HGes', permalink: 'u',
      });

      expect(await new JPortalAdapter().toc('HE', 'jlr-Foo')).toEqual([]);
    });
  });
});
