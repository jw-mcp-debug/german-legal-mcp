import { describe, expect, it } from 'vitest';
import { HausIndexStore } from './store.js';
import { HausDataClient, toReference } from './data-client.js';
import { ingestDocument } from './ingest.js';
import type { HausIngestInput } from './ingest.js';

function seed(count: number): HausIndexStore {
  const store = new HausIndexStore(':memory:');
  for (let i = 0; i < count; i++) {
    const input: HausIngestInput = {
      url: `https://example.test/doc-${i}`,
      title: `Handreichung ${i}`,
      body: 'Lizenzverträge werden vom Justiziariat geprüft.',
      normativeForce: 'guidance',
      confidentiality: 'public',
      documentType: 'Handreichung',
      asOf: '2025-01-01',
      owner: 'Justiziariat',
      retrievedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    };
    ingestDocument(store, input);
  }
  return store;
}

describe('toReference', () => {
  it('carries force, status and Stand onto the normalized reference', () => {
    const store = seed(1);
    const reference = toReference(store.get(store.enumerate()[0]!.id)!);
    expect(reference.resourceType).toBe('administrative-guidance');
    expect(reference.normativeForce).toBe('guidance');
    expect(reference.status).toBe('in-force');
    expect(reference.asOf).toBe('2025-01-01');
    expect(reference.owner).toBe('Justiziariat');
    expect(reference.provenance.canonicalUrl).toBe('https://example.test/doc-0');
    expect(reference.rights.licence).toBe('NOASSERTION');
    store.close();
  });
});

describe('HausDataClient', () => {
  it('searches and pages with a cursor', async () => {
    const store = seed(3);
    const client = new HausDataClient(store);
    const first = await client.search({ query: 'Lizenzverträge', limit: 2 });
    expect(first.results).toHaveLength(2);
    expect(first.failures).toEqual([]);
    expect(first.nextCursor).toBe('2');
    const second = await client.search({ query: 'Lizenzverträge', limit: 2, cursor: '2' });
    expect(second.results).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    store.close();
  });

  it('retrieves a document by reference, and by URL when the id is unknown', async () => {
    const store = seed(1);
    const client = new HausDataClient(store);
    const [reference] = (await client.search({ query: 'Lizenzverträge' })).results;
    const document = await client.get(reference!);
    expect(document.content.format).toBe('markdown');
    expect(document.content.value).toContain('Justiziariat');

    const byUrl = await client.get({
      ...reference!,
      provenance: { ...reference!.provenance, providerDocumentId: 'unbekannt' },
    });
    expect(byUrl.reference.title).toBe('Handreichung 0');
    store.close();
  });

  it('reports a reference the index does not hold', async () => {
    const store = seed(1);
    const client = new HausDataClient(store);
    const [reference] = (await client.search({ query: 'Lizenzverträge' })).results;
    await expect(client.get({
      ...reference!,
      provenance: {
        ...reference!.provenance,
        providerDocumentId: 'fehlt',
        canonicalUrl: 'https://example.test/gibt-es-nicht',
      },
    })).rejects.toThrow(/Not in the house index/);
    store.close();
  });

  it('enumerates natively, because the bound is a predicate not a post-filter', async () => {
    const store = seed(3);
    const client = new HausDataClient(store);
    const all = await client.enumerate();
    expect(all.origin).toBe('native');
    expect(all.results).toHaveLength(3);

    const delta = await client.enumerate({ since: '2026-01-03T00:00:00.000Z' });
    expect(delta.results).toHaveLength(1);

    const paged = await client.enumerate({ limit: 2 });
    expect(paged.nextCursor).toBe('2');
    expect((await client.enumerate({ limit: 2, cursor: '2' })).results).toHaveLength(1);
    store.close();
  });
});
