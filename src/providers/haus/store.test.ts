import { describe, expect, it } from 'vitest';
import { HausIndexStore, contentHash, documentId } from './store.js';
import type { HausDocumentRecord } from './store.js';

function record(overrides: Partial<HausDocumentRecord> = {}): HausDocumentRecord {
  const url = overrides.url ?? 'https://example.test/handreichung';
  const body = overrides.body ?? 'Für Lizenzverträge gilt die Vier-Augen-Prüfung durch das Justiziariat.';
  return {
    id: documentId(url),
    url,
    title: 'Handreichung Lizenzverträge',
    documentType: 'Handreichung',
    normativeForce: 'guidance',
    status: 'in-force',
    confidentiality: 'public',
    asOf: '2024-03-01',
    owner: 'Justiziariat',
    language: 'de',
    licence: 'NOASSERTION',
    redistribution: 'unknown',
    contentHash: contentHash(body),
    retrievedAt: '2026-01-15T09:00:00.000Z',
    body,
    ...overrides,
  };
}

function store(): HausIndexStore {
  return new HausIndexStore(':memory:');
}

describe('documentId', () => {
  it('is stable for a URL and distinct between URLs', () => {
    expect(documentId('https://a.test/x')).toBe(documentId('https://a.test/x'));
    expect(documentId('https://a.test/x')).not.toBe(documentId('https://a.test/y'));
  });
});

describe('HausIndexStore', () => {
  it('round-trips a document by id and by URL', () => {
    const db = store();
    const doc = record();
    db.upsert(doc);
    expect(db.get(doc.id)?.title).toBe('Handreichung Lizenzverträge');
    expect(db.getByUrl(doc.url)?.id).toBe(doc.id);
    expect(db.get('missing')).toBeNull();
    db.close();
  });

  it('replaces rather than duplicates on re-ingest of the same URL', () => {
    const db = store();
    db.upsert(record());
    db.upsert(record({ title: 'Handreichung Lizenzverträge (überarbeitet)' }));
    expect(db.count()).toBe(1);
    expect(db.search('Lizenzverträge')).toHaveLength(1);
    db.close();
  });

  it('finds a document by a word in its body and reports a snippet', () => {
    const db = store();
    db.upsert(record());
    const [hit] = db.search('Vier-Augen-Prüfung');
    expect(hit?.title).toBe('Handreichung Lizenzverträge');
    expect(hit?.snippet).toContain('«');
    db.close();
  });

  it('does not choke on the punctuation a legal query is full of', () => {
    const db = store();
    db.upsert(record({ body: 'Text-Data-Mining nach § 60d UrhG ist zulässig.' }));
    expect(() => db.search('§ 60d UrhG')).not.toThrow();
    expect(db.search('§ 60d UrhG')).toHaveLength(1);
    expect(db.search('Az. 4-2/17 (Vorgang)')).toEqual([]);
    db.close();
  });

  it('returns nothing for a query that is only punctuation', () => {
    const db = store();
    db.upsert(record());
    expect(db.search('   ')).toEqual([]);
    db.close();
  });

  it('hides superseded documents unless they are asked for', () => {
    const db = store();
    db.upsert(record());
    db.upsert(record({
      url: 'https://example.test/alt',
      id: documentId('https://example.test/alt'),
      status: 'superseded',
    }));
    expect(db.search('Lizenzverträge')).toHaveLength(1);
    expect(db.search('Lizenzverträge', { includeOutdated: true })).toHaveLength(2);
    expect(db.count()).toBe(1);
    expect(db.count(true)).toBe(2);
    db.close();
  });

  it('filters by type, owner and binding force', () => {
    const db = store();
    db.upsert(record());
    db.upsert(record({
      url: 'https://example.test/beschluss',
      id: documentId('https://example.test/beschluss'),
      documentType: 'Beschluss',
      normativeForce: 'binding',
      owner: 'Präsidium',
    }));
    expect(db.search('Lizenzverträge', { documentType: 'Beschluss' })).toHaveLength(1);
    expect(db.search('Lizenzverträge', { owner: 'Justiziariat' })).toHaveLength(1);
    expect(db.search('Lizenzverträge', { normativeForce: 'binding' })[0]?.owner).toBe('Präsidium');
    db.close();
  });

  it('marks a vanished source without discarding what it said', () => {
    const db = store();
    const doc = record();
    db.upsert(doc);
    db.markStatus(doc.id, 'unknown');
    expect(db.get(doc.id)?.status).toBe('unknown');
    expect(db.get(doc.id)?.body).toContain('Vier-Augen-Prüfung');
    expect(db.search('Lizenzverträge')).toEqual([]);
    db.close();
  });

  it('reports coverage grouped by type and office', () => {
    const db = store();
    db.upsert(record());
    db.upsert(record({
      url: 'https://example.test/faq',
      id: documentId('https://example.test/faq'),
      documentType: 'FAQ',
      asOf: '2020-01-01',
    }));
    const coverage = db.coverage();
    expect(coverage).toHaveLength(2);
    expect(coverage.map((row) => row.documentType).sort()).toEqual(['FAQ', 'Handreichung']);
    expect(coverage.every((row) => row.count === 1)).toBe(true);
    db.close();
  });

  it('lists stale documents oldest first, with undated ones last', () => {
    const db = store();
    db.upsert(record({ asOf: '2019-01-01' }));
    db.upsert(record({
      url: 'https://example.test/undatiert',
      id: documentId('https://example.test/undatiert'),
      asOf: undefined,
    }));
    db.upsert(record({
      url: 'https://example.test/frisch',
      id: documentId('https://example.test/frisch'),
      asOf: '2026-06-01',
    }));
    const stale = db.stale('2025-01-01');
    expect(stale).toHaveLength(2);
    expect(stale[0]?.asOf).toBe('2019-01-01');
    expect(stale[1]?.asOf).toBeUndefined();
    db.close();
  });

  it('enumerates from a retrieval bound and pages', () => {
    const db = store();
    db.upsert(record({ retrievedAt: '2026-01-01T00:00:00.000Z' }));
    db.upsert(record({
      url: 'https://example.test/neu',
      id: documentId('https://example.test/neu'),
      retrievedAt: '2026-02-01T00:00:00.000Z',
    }));
    expect(db.enumerate()).toHaveLength(2);
    expect(db.enumerate('2026-01-15T00:00:00.000Z')).toHaveLength(1);
    expect(db.enumerate(undefined, 1, 1)).toHaveLength(1);
    db.close();
  });
});
