import { describe, expect, it } from 'vitest';
import { HausProvider } from './provider.js';
import { HausIndexStore } from './store.js';
import { ingestDocument } from './ingest.js';
import type { HausConfig } from './config.js';

const CONFIG: HausConfig = {
  enabled: true,
  indexPath: ':memory:',
  staleAfterMonths: 24,
};

function seeded(): { provider: HausProvider; store: HausIndexStore } {
  const store = new HausIndexStore(':memory:');
  ingestDocument(store, {
    sourceId: 'web',
    url: 'https://example.test/handreichung',
    title: 'Handreichung Lizenzverträge',
    body: '# Prüfung\n\nLizenzverträge werden vom Justiziariat geprüft.\n\n# Fristen\n\nVier Wochen vor Vertragsschluss.',
    normativeForce: 'guidance',
    confidentiality: 'public',
    documentType: 'Handreichung',
    asOf: '2019-03-01',
    owner: 'Justiziariat',
  });
  return { provider: new HausProvider(CONFIG, store), store };
}

function text(result: { content: Array<{ text: string }> }): string {
  return result.content.map((block) => block.text).join('\n');
}

describe('HausProvider', () => {
  it('exposes exactly the six haus tools', () => {
    const names = new HausProvider(CONFIG, new HausIndexStore(':memory:'))
      .getTools().map((tool) => tool.name);
    expect(names).toEqual([
      'haus:search', 'haus:get', 'haus:coverage', 'haus:legal_basis',
      'haus:history', 'haus:stale',
    ]);
  });

  it('rejects an unknown tool', async () => {
    const { provider } = seeded();
    const result = await provider.handleToolCall('haus:nope', {});
    expect(result.isError).toBe(true);
    await provider.shutdown();
  });

  it('tells a caller the index is empty instead of answering "nothing found"', async () => {
    const provider = new HausProvider(CONFIG, new HausIndexStore(':memory:'));
    const result = await provider.handleToolCall('haus:search', { query: 'Lizenz' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('leer');
    expect(text(result)).toContain('keine Aussage');
    await provider.shutdown();
  });

  it('carries the scope caveat and the metadata columns into a hit list', async () => {
    const { provider } = seeded();
    const result = await provider.handleToolCall('haus:search', { query: 'Lizenzverträge' });
    const rendered = text(result);
    expect(rendered).toContain('Handreichung Lizenzverträge');
    expect(rendered).toContain('Verbindlichkeit');
    expect(rendered).toContain('Rechtslage');
    await provider.shutdown();
  });

  it('separates "not covered" from "no such rule" on an empty result', async () => {
    const { provider } = seeded();
    const rendered = text(await provider.handleToolCall('haus:search', { query: 'Dienstreise' }));
    expect(rendered).toContain('Keine Treffer');
    expect(rendered).toContain('haus:coverage');
    await provider.shutdown();
  });

  it('answers with the banner and a map, not with the whole document', async () => {
    // An Ordnung runs to some 12.000 tokens against a few hundred for one
    // paragraph, so the default is an outline and the text is one flag away.
    const { provider, store } = seeded();
    const id = store.enumerate()[0]!.id;
    const outline = text(await provider.handleToolCall('haus:get', { id }));
    expect(outline.startsWith('⚠')).toBe(true);
    expect(outline).toContain('unverbindliche Orientierung');
    expect(outline).toContain('Aktualität prüfen');
    expect(outline).toContain('Gliederung');
    expect(outline).toContain('Fristen');
    expect(outline).not.toContain('Vier Wochen');

    const full = text(await provider.handleToolCall('haus:get', { id, full: true }));
    expect(full).toContain('Vier Wochen');
    expect(full.startsWith('⚠')).toBe(true);
    await provider.shutdown();
  });

  it('retrieves by URL and by section, and reports what it cannot find', async () => {
    const { provider } = seeded();
    const bySection = text(await provider.handleToolCall('haus:get', {
      url: 'https://example.test/handreichung',
      section: 'Fristen',
    }));
    expect(bySection).toContain('Vier Wochen');
    expect(bySection).not.toContain('vom Justiziariat geprüft');

    const missing = await provider.handleToolCall('haus:get', { id: 'gibt-es-nicht' });
    expect(missing.isError).toBe(true);

    const neither = await provider.handleToolCall('haus:get', {});
    expect(neither.isError).toBe(true);
    expect(text(neither)).toContain('required');
    await provider.shutdown();
  });

  it('reports coverage per type and office', async () => {
    const { provider } = seeded();
    const rendered = text(await provider.handleToolCall('haus:coverage', {}));
    expect(rendered).toContain('[web] Handreichung · Justiziariat: 1');
    expect(rendered).toContain('Stand 2019-03-01');
    await provider.shutdown();
  });

  it('says the index is empty rather than printing an empty coverage table', async () => {
    const provider = new HausProvider(CONFIG, new HausIndexStore(':memory:'));
    expect(text(await provider.handleToolCall('haus:coverage', {}))).toContain('leer');
    await provider.shutdown();
  });

  it('lists documents past the staleness cut-off, and reports when none are', async () => {
    const { provider } = seeded();
    const stale = text(await provider.handleToolCall('haus:stale', {}));
    expect(stale).toContain('2019-03-01');
    expect(stale).toContain('Justiziariat');

    const none = text(await provider.handleToolCall('haus:stale', { max_age_months: 1200 }));
    expect(none).toContain('Kein gültiges Dokument');
    await provider.shutdown();
  });

  it('groups a rule\'s citations by where each has to be resolved', async () => {
    const store = new HausIndexStore(':memory:');
    ingestDocument(store, {
      sourceId: 'opus4-bht',
      url: 'https://example.test/wahlo',
      title: 'Wahlordnung der BHT (BHT-WahlO)',
      body: 'Gemäß § 61 Abs. 2 Nr. 7 BerlHG und § 9 BHT-WahlO sowie nach § 2 Abs. 1 gilt.',
      normativeForce: 'binding',
      confidentiality: 'public',
      authority: 'official',
    });
    const provider = new HausProvider(CONFIG, store);
    const id = store.enumerate()[0]!.id;
    const rendered = text(await provider.handleToolCall('haus:legal_basis', { id }));

    expect(rendered).toContain('§ 61 Abs. 2 Nr. 7 BerlHG');
    expect(rendered).toContain('legis:');
    // The document announces (BHT-WahlO) itself, so a citation to it resolves
    // inside the corpus rather than being sent to the legislation provider.
    expect(rendered).toContain('Andere Hausvorschriften');
    expect(rendered).toContain('§ 9 BHT-WahlO');
    await provider.shutdown();
  });

  it('reports a legal_basis request for a document it does not hold', async () => {
    const { provider } = seeded();
    const result = await provider.handleToolCall('haus:legal_basis', { id: 'weg' });
    expect(result.isError).toBe(true);
    await provider.shutdown();
  });

  it('warns that an amendment is not the rule, and names what it changes', async () => {
    const store = new HausIndexStore(':memory:');
    const base = {
      sourceId: 'opus4-bht', normativeForce: 'binding', confidentiality: 'public',
      authority: 'official',
    } as const;
    ingestDocument(store, {
      ...base,
      url: 'https://example.test/go',
      title: 'Geschäftsordnung des AS vom 05.12.2013',
      body: 'Regeltext.',
      asOf: '2013-12-05',
    });
    ingestDocument(store, {
      ...base,
      url: 'https://example.test/ae',
      title: 'Vierte Änderung der Geschäftsordnung des AS vom 05.12.2013 vom 15.01.2026',
      body: 'Änderungstext.',
      asOf: '2026-01-15',
    });
    const provider = new HausProvider(CONFIG, store);
    const byUrl = (url: string) => store.getByUrl(url)!.id;

    const amendment = text(await provider.handleToolCall('haus:history',
      { id: byUrl('https://example.test/ae') }));
    expect(amendment).toContain('enthält nicht');
    expect(amendment).toContain('Geschäftsordnung des AS');

    const rule = text(await provider.handleToolCall('haus:history',
      { id: byUrl('https://example.test/go') }));
    expect(rule).toContain('1 spätere Änderung');
    expect(rule).toContain('2026-01-15');
    expect(rule).toContain('vor** diesen Änderungen');
    await provider.shutdown();
  });

  it('says an absent base rule is absent instead of implying nothing changed', async () => {
    const store = new HausIndexStore(':memory:');
    ingestDocument(store, {
      sourceId: 'opus4-bht',
      url: 'https://example.test/ae2',
      title: 'Erste Änderung der Grundordnung vom 01.01.2010 vom 15.01.2026',
      body: 'Text.',
      normativeForce: 'binding', confidentiality: 'public', authority: 'official',
    });
    const provider = new HausProvider(CONFIG, store);
    const rendered = text(await provider.handleToolCall('haus:history',
      { id: store.enumerate()[0]!.id }));
    expect(rendered).toContain('liegt nicht im Index');
    await provider.shutdown();
  });

  it('counts the amendments whose base rule the index lacks', async () => {
    const store = new HausIndexStore(':memory:');
    ingestDocument(store, {
      sourceId: 'opus4-bht',
      url: 'https://example.test/ae3',
      title: 'Erste Änderung der Grundordnung vom 01.01.2010 vom 15.01.2026',
      body: 'Text.',
      normativeForce: 'binding', confidentiality: 'public', authority: 'official',
    });
    const provider = new HausProvider(CONFIG, store);
    const rendered = text(await provider.handleToolCall('haus:coverage', {}));
    expect(rendered).toContain('davon 1 ohne Stammvorschrift im Index');
    await provider.shutdown();
  });

  it('opens the index on initialize and hands out a typed data client', async () => {
    const { provider } = seeded();
    await provider.initialize();
    const client = provider.createDataClient();
    expect((await client.search({ query: 'Lizenzverträge' })).results).toHaveLength(1);
    await provider.shutdown();
  });
});
