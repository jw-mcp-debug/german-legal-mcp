import { describe, expect, it, vi } from 'vitest';
import type { ParliamentaryMaterialReference } from '../../contracts/legal-resource.js';
import type { DipClient, DipDocument } from './client.js';
import { DipDataClient } from './data-client.js';

const document: DipDocument = {
  id: 'D1',
  titel: '  Gesetzentwurf\r\nzum Test  ',
  datum: '2026-01-01',
  dokumentnummer: '21/1',
  wahlperiode: 21,
  herausgeber: 'Bundestag',
  text: 'Volltext',
  fundstelle: { pdf_url: 'https://example.test/d1.pdf' },
};

function client(found: DipDocument | null = document): DipClient {
  const result = { numFound: found ? 1 : 0, documents: found ? [found] : [], cursor: 'next' };
  return {
    searchDrucksachen: vi.fn(async () => result),
    searchDrucksachenText: vi.fn(async () => result),
    searchVorgang: vi.fn(async () => result),
    searchPlenarprotokollText: vi.fn(async () => result),
    getDrucksache: vi.fn(async () => found),
  } as unknown as DipClient;
}

describe('DipDataClient', () => {
  it('normalizes parliamentary search, cursor and content', async () => {
    const data = new DipDataClient(client());
    const page = await data.search({ query: 'Entwurf', limit: 2, cursor: 'old' });
    expect(page.nextCursor).toBe('next');
    expect(page.results[0]).toMatchObject({
      resourceType: 'parliamentary-material',
      title: 'Gesetzentwurf zum Test',
      documentNumber: '21/1',
      legislativePeriod: 21,
      issuer: 'Bundestag',
    });
    expect((await data.get(page.results[0]!)).content.value).toBe('Volltext');
  });

  it('filters scope and validates ownership and missing documents', async () => {
    const data = new DipDataClient(client(null));
    for (const request of [
      { query: 'x', resourceTypes: ['case-law'] as const },
      { query: 'x', jurisdictions: ['AT'] },
      { query: 'x', sourceIds: ['other'] },
    ]) {
      await expect(data.search(request)).resolves.toEqual({ results: [], failures: [] });
    }
    const reference = {
      resourceType: 'parliamentary-material',
      title: 'x',
      provenance: { providerId: 'dip', sourceId: 'dip:bundestag', providerDocumentId: 'missing' },
      rights: { access: 'public', fullTextStorage: 'allowed', redistribution: 'allowed' },
    } as ParliamentaryMaterialReference;
    await expect(data.get(reference)).rejects.toThrow('not found');
    await expect(data.get({
      ...reference,
      provenance: { ...reference.provenance, providerId: 'other' },
    })).rejects.toThrow('does not belong');
  });
});
