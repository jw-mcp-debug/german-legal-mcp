import { describe, expect, it } from 'vitest';
import { HausIndexStore, documentId } from './store.js';
import { ConfidentialDocumentRejected, ingestDocument } from './ingest.js';
import type { HausIngestInput } from './ingest.js';

function input(overrides: Partial<HausIngestInput> = {}): HausIngestInput {
  return {
    url: 'https://example.test/merkblatt',
    title: 'Merkblatt Open Access',
    body: 'Zweitveröffentlichungen sind über das Repositorium zu melden.',
    normativeForce: 'guidance',
    confidentiality: 'public',
    documentType: 'Merkblatt',
    asOf: '2025-09-01',
    owner: 'Bibliothek',
    ...overrides,
  };
}

describe('ingestDocument', () => {
  it('creates, then reports no change, then updates on changed content', () => {
    const store = new HausIndexStore(':memory:');
    expect(ingestDocument(store, input())).toBe('created');
    expect(ingestDocument(store, input())).toBe('unchanged');
    expect(ingestDocument(store, input({ body: 'Neuer Text.' }))).toBe('updated');
    expect(store.count()).toBe(1);
    store.close();
  });

  it('treats a status change as an update even when the text is identical', () => {
    const store = new HausIndexStore(':memory:');
    ingestDocument(store, input());
    expect(ingestDocument(store, input({ status: 'superseded' }))).toBe('updated');
    expect(store.get(documentId('https://example.test/merkblatt'))?.status).toBe('superseded');
    store.close();
  });

  it('refuses anything not marked public, and writes nothing', () => {
    const store = new HausIndexStore(':memory:');
    expect(() => ingestDocument(store, input({ confidentiality: 'internal' })))
      .toThrow(ConfidentialDocumentRejected);
    expect(() => ingestDocument(store, input({ confidentiality: 'restricted' })))
      .toThrow(/Refusing to index/);
    expect(store.count(true)).toBe(0);
    store.close();
  });

  it('defaults rights to an unread licence rather than a permissive one', () => {
    const store = new HausIndexStore(':memory:');
    ingestDocument(store, input());
    const stored = store.get(documentId('https://example.test/merkblatt'));
    expect(stored?.licence).toBe('NOASSERTION');
    expect(stored?.redistribution).toBe('unknown');
    expect(stored?.language).toBe('de');
    store.close();
  });
});
