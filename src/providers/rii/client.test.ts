import { describe, expect, it, vi } from 'vitest';
import { CaseLawClient, PUBLIC_CASE_LAW_RIGHTS } from './client.js';
import type { DecisionAdapter } from './types.js';

function fixtureAdapter(
  source: string,
  title: string,
): DecisionAdapter {
  return {
    sources: [source],
    search: vi.fn(async () => [{
      id: `${source}-1`,
      title,
      subtitle: `${source} portal`,
      date: '2026-08-03',
      court: 'Verwaltungsgericht',
      fileNumber: '1 A 1/26',
      ecli: `ECLI:DE:${source}:2026:1A1.26.00`,
      url: `https://example.test/${source}/1`,
    }]),
    get: vi.fn(async () => ({
      title,
      content: 'Normalized full decision text.',
      url: `https://example.test/${source}/1`,
      court: 'Verwaltungsgericht',
      date: '2026-08-03',
      fileNumber: '1 A 1/26',
      ecli: `ECLI:DE:${source}:2026:1A1.26.00`,
    })),
  };
}

describe('CaseLawClient component contract', () => {
  it('returns transport-neutral references and documents for application consumers', async () => {
    const client = new CaseLawClient([
      fixtureAdapter('BUND', 'Federal decision'),
      fixtureAdapter('NW', 'North Rhine-Westphalia decision'),
    ]);

    const page = await client.search({
      query: 'data protection',
      jurisdictions: ['DE-NW'],
      resourceTypes: ['case-law'],
      limit: 5,
    });

    expect(page.failures).toEqual([]);
    expect(page.results).toEqual([expect.objectContaining({
      resourceType: 'case-law',
      jurisdiction: 'DE-NW',
      title: 'North Rhine-Westphalia decision',
      provenance: expect.objectContaining({
        providerId: 'de-case-law',
        sourceId: 'de-case-law:NW',
        providerDocumentId: 'NW-1',
      }),
      rights: {
        access: 'public',
        fullTextStorage: 'allowed',
        redistribution: 'unknown',
      },
    })]);

    const reference = page.results[0];
    expect(reference).toBeDefined();
    if (!reference) return;
    await expect(client.get(reference)).resolves.toEqual(expect.objectContaining({
      content: { format: 'markdown', value: 'Normalized full decision text.' },
    }));
  });

  it('attributes partial failures to the actual source', async () => {
    const failing: DecisionAdapter = {
      sources: ['NW'],
      search: vi.fn(async () => { throw new Error('NW unavailable'); }),
      get: vi.fn(),
    };
    const client = new CaseLawClient([
      fixtureAdapter('BUND', 'Federal decision'),
      failing,
      fixtureAdapter('BY', 'Bavarian decision'),
    ]);

    const page = await client.search({ query: 'privacy' });

    expect(page.results).toHaveLength(2);
    expect(page.failures).toEqual([expect.objectContaining({
      sourceId: 'de-case-law:NW',
      message: 'NW unavailable',
    })]);
  });

  it('preserves search metadata when a detail page omits its heading and metadata', async () => {
    const adapter = fixtureAdapter('BUND', 'Federal search title');
    adapter.get = vi.fn(async () => ({
      title: '',
      content: 'Normalized full decision text.',
      url: '',
      court: '',
      date: '',
      fileNumber: '',
    }));
    const client = new CaseLawClient([adapter]);
    const page = await client.search({ query: 'privacy', limit: 1 });
    const reference = page.results[0];
    expect(reference).toBeDefined();
    if (!reference) return;

    const document = await client.get(reference);

    expect(document.reference).toMatchObject({
      title: 'Federal search title',
      decisionDate: '2026-08-03',
      court: 'Verwaltungsgericht',
      fileNumber: '1 A 1/26',
      ecli: 'ECLI:DE:BUND:2026:1A1.26.00',
      provenance: {
        canonicalUrl: 'https://example.test/BUND/1',
      },
    });
  });

  it('supports another EU member state through configuration instead of a fork', async () => {
    const client = new CaseLawClient(
      [fixtureAdapter('RIS', 'Austrian decision')],
      {
        providerId: 'at-case-law',
        language: 'de',
        locale: 'de-AT',
        rights: PUBLIC_CASE_LAW_RIGHTS,
        jurisdictionForSource: () => 'AT',
        sourceForJurisdiction: (jurisdiction) =>
          jurisdiction.toUpperCase() === 'AT' ? 'RIS' : undefined,
      },
    );

    const page = await client.search({ query: 'Datenschutz', jurisdictions: ['AT'] });

    expect(page.results).toEqual([expect.objectContaining({
      jurisdiction: 'AT',
      provenance: expect.objectContaining({
        providerId: 'at-case-law',
        sourceId: 'at-case-law:RIS',
      }),
    })]);
  });
});
