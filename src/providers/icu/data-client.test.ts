import { describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import type { CaseLawReference } from '../../contracts/legal-resource.js';
import { celexCandidates, IcuDataClient } from './data-client.js';

const content = {
  docType: 'Urteil',
  docDate: '2026-01-01',
  idPublished: 'C-1/26',
  ecli: 'ECLI:EU:C:2026:1',
  celex: '62026CJ0001',
  affairJurisdiction: 'Gerichtshof',
  logicDocId: 'id_123',
};

function http(searchHits = [{ content }]) {
  return {
    post: vi.fn(async () => ({ data: { totalHits: searchHits.length, searchHits } })),
    get: vi.fn(async () => ({
      data: '<P><A NAME="point1">1</A> Entscheidungstext mit genügend Inhalt.</P>',
    })),
  } as unknown as Pick<AxiosInstance, 'get' | 'post'>;
}

describe('IcuDataClient', () => {
  it('normalizes InfoCuria case law and retrieves content', async () => {
    const transport = http();
    const data = new IcuDataClient(transport);
    const page = await data.search({ query: 'privacy', limit: 1 });
    expect(page.results[0]).toMatchObject({
      resourceType: 'case-law',
      jurisdiction: 'EU',
      court: 'Gerichtshof',
      fileNumber: 'C-1/26',
      ecli: 'ECLI:EU:C:2026:1',
      provenance: { providerDocumentId: 'id_123' },
    });
    expect((await data.get(page.results[0]!)).content.value).toContain('[Rn. 1]{.rn}');
  });

  it('falls back to the EUR-Lex ECLI URL when no CELEX id is present', async () => {
    const transport = http([{
      content: {
        docType: 'Urteil',
        docDate: '2026-01-01',
        idPublished: 'C-1/26',
        ecli: 'ECLI:EU:C:2026:1',
        affairJurisdiction: 'Gerichtshof',
        logicDocId: 'id_123',
      },
    }]);
    const data = new IcuDataClient(transport);
    const page = await data.search({ query: 'privacy', limit: 1 });
    expect(page.results[0]?.provenance.canonicalUrl).toBe(
      'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=ecli:ECLI:EU:C:2026:1',
    );
  });

  // A logicDocId alone is deliberately not enough: the curia.europa.eu viewer
  // URL built from it answers 200 but serves no document text, so emitting it
  // would be a dead link dressed up as an official source.
  it('omits canonicalUrl when neither a CELEX id nor an ECLI is available', async () => {
    const transport = http([{
      content: { docType: 'Urteil', idPublished: 'C-2/26', logicDocId: 'id_456' },
    }]);
    const data = new IcuDataClient(transport);
    const page = await data.search({ query: 'privacy', limit: 1 });
    expect(page.results[0]?.provenance.canonicalUrl).toBeUndefined();
  });

  it('resolves numeric, published and CELEX identifiers', async () => {
    const transport = http();
    const data = new IcuDataClient(transport);
    await data.getCaseLaw('123', 'DE');
    await data.getCaseLaw('C-1/26', 'DE');
    await data.getCaseLaw('62026CJ0001', 'EN');
    expect(transport.get).toHaveBeenCalledWith(
      expect.stringContaining('/123/DE/html'),
      expect.any(Object),
    );
    // C-1/26 → 62026CJ0001: sector 6, year, judgment code, padded number.
    expect(transport.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ searchTerm: '62026CJ0001' }),
      expect.any(Object),
    );
    expect(transport.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ searchTerm: '62026CJ0001' }),
      expect.any(Object),
    );
  });

  it('filters scope, validates references and reports missing ids', async () => {
    const data = new IcuDataClient(http([]));
    for (const request of [
      { query: 'x', resourceTypes: ['legislation'] as const },
      { query: 'x', jurisdictions: ['DE'] },
      { query: 'x', sourceIds: ['other'] },
    ]) {
      await expect(data.search(request)).resolves.toEqual({ results: [], failures: [] });
    }
    await expect(data.getCaseLaw('C-9/99')).resolves.toBeNull();
    const wrong = {
      resourceType: 'case-law',
      title: 'x',
      provenance: { providerId: 'other', sourceId: 'icu:infocuria', providerDocumentId: 'x' },
      rights: { access: 'public', fullTextStorage: 'allowed', redistribution: 'unknown' },
    } as CaseLawReference;
    await expect(data.get(wrong)).rejects.toThrow('does not belong');
  });
});

describe('celexCandidates', () => {
  it('converts published case numbers verified against live InfoCuria data', () => {
    // Each pair was confirmed live: the CELEX form resolves, the bare case
    // number does not.
    expect(celexCandidates('C-476/17')[0]).toBe('62017CJ0476');
    expect(celexCandidates('C-797/23')[0]).toBe('62023CJ0797');
    expect(celexCandidates('T-108/25')[0]).toBe('62025TJ0108');
  });

  it('offers the order code as a fallback, since the case number cannot reveal it', () => {
    expect(celexCandidates('C-476/17')).toEqual(['62017CJ0476', '62017CO0476']);
    expect(celexCandidates('T-108/25')).toEqual(['62025TJ0108', '62025TO0108']);
  });

  it('pads the case number and expands two-digit years around the 1953 start', () => {
    expect(celexCandidates('C-1/26')[0]).toBe('62026CJ0001');
    expect(celexCandidates('C-6/64')[0]).toBe('61964CJ0006');   // Costa v ENEL era
    expect(celexCandidates('C-476/2017')[0]).toBe('62017CJ0476'); // four-digit year
  });

  it('returns nothing for input that is not a published case number', () => {
    expect(celexCandidates('62017CJ0476')).toEqual([]);
    expect(celexCandidates('id_320668')).toEqual([]);
    expect(celexCandidates('Pelham')).toEqual([]);
  });
});
