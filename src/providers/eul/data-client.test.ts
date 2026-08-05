import { describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import type { LegislationReference } from '../../contracts/legal-resource.js';
import { EulDataClient } from './data-client.js';

function http() {
  return {
    get: vi.fn(async (url: string) => url.includes('sparql')
      ? {
          data: {
            results: {
              bindings: [{
                celex: { value: '32016R0679' },
                title: { value: 'Datenschutz-Grundverordnung' },
              }],
            },
          },
        }
      : { data: '<div id="document1"><p>Rechtstext mit genügend Inhalt für einen Test.</p></div>' }),
  } as unknown as Pick<AxiosInstance, 'get'>;
}

describe('EulDataClient', () => {
  it('normalizes Cellar searches and documents', async () => {
    const transport = http();
    const data = new EulDataClient(transport);
    const page = await data.search({ query: 'Datenschutz', limit: 4 });
    expect(page.results[0]).toMatchObject({
      resourceType: 'legislation',
      jurisdiction: 'EU',
      celex: '32016R0679',
      provenance: { providerId: 'eul', sourceId: 'eul:cellar' },
    });
    expect((await data.get(page.results[0]!)).content.value).toContain('Rechtstext');
    expect(transport.get).toHaveBeenCalledWith(
      expect.stringContaining('32016R0679'),
      expect.objectContaining({ responseType: 'text' }),
    );
  });

  it('applies type, jurisdiction and source filters', async () => {
    const data = new EulDataClient(http());
    for (const request of [
      { query: 'x', resourceTypes: ['case-law'] as const },
      { query: 'x', jurisdictions: ['DE'] },
      { query: 'x', sourceIds: ['other'] },
    ]) {
      await expect(data.search(request)).resolves.toEqual({ results: [], failures: [] });
    }
    const wrong = {
      resourceType: 'legislation',
      title: 'x',
      provenance: { providerId: 'other', sourceId: 'eul:cellar', providerDocumentId: 'x' },
      rights: { access: 'public', fullTextStorage: 'allowed', redistribution: 'unknown' },
    } as LegislationReference;
    await expect(data.get(wrong)).rejects.toThrow('does not belong');
  });

  it('uses language and resource-type filters in SPARQL', async () => {
    const transport = http();
    const data = new EulDataClient(transport);
    await data.searchLegislation('"privacy"', {
      resourceType: 'regulation',
      language: 'EN',
      limit: 2,
    });
    const options = vi.mocked(transport.get).mock.calls[0]?.[1] as { params: { query: string } };
    expect(options.params.query).toContain('resource-type/REG');
    expect(options.params.query).toContain('language/ENG');
    expect(options.params.query).toContain('LIMIT 2');
  });
});
