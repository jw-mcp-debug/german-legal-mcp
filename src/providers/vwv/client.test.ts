import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { VwvClient } from './client.js';

const FIXTURES = join(process.cwd(), 'src/providers/vwv/__fixtures__');
const latin1 = (name: string) =>
  Buffer.from(readFileSync(join(FIXTURES, name), 'utf-8'), 'latin1');

const indexPath = () => join(tmpdir(), `vwv-${randomUUID()}.json`);

function stubHttp(routes: Record<string, string>) {
  return {
    get: vi.fn(async (url: string) => {
      const key = Object.keys(routes).find((needle) => url.includes(needle));
      if (!key) throw new Error(`unexpected GET ${url}`);
      return { data: latin1(routes[key]!) };
    }),
    post: vi.fn(async () => ({ data: latin1('suchergebnis.html') })),
  };
}

const PORTAL = {
  'erlassstellen.html': 'erlassstellen.html',
  'Teilliste_Bundesministerium_der_Finanzen': 'teilliste-bmf.html',
  'Teilliste_': 'teilliste-bmfsfj.html',
  '.htm': 'dokument-anbest-i.html',
};

describe('VwvClient', () => {
  it('searches and parses the portal result page', async () => {
    const http = stubHttp(PORTAL);
    const page = await new VwvClient(http, indexPath()).search('Nebenbestimmungen');
    expect(page.total).toBe(6);
    expect(page.hits[0]?.docId).toBe('BMF-IIA2-21122017-H-08-10-KF-001-A003');
    // ht://Dig takes a form post, not a query string.
    expect(http.post).toHaveBeenCalledOnce();
    const body = String(http.post.mock.calls[0]![1]);
    expect(body).toContain('config=Gesamt_vwvbund');
  });

  it('uses the title configuration when asked to search titles', async () => {
    const http = stubHttp(PORTAL);
    await new VwvClient(http, indexPath()).search('Nebenbestimmungen', 'title');
    expect(String(http.post.mock.calls[0]![1])).toContain('config=Titel_vwvbund');
  });

  it('builds the title index from the ministry listings', async () => {
    const client = new VwvClient(stubHttp(PORTAL), indexPath());
    const index = await client.getTitleIndex();
    expect(index.length).toBeGreaterThan(30);
    expect(index.some((entry) => entry.abbreviation !== undefined)).toBe(true);
  });

  it('builds the index once, however many callers ask at the same time', async () => {
    // Twenty-odd requests per build; two concurrent callers must not each pay.
    const http = stubHttp(PORTAL);
    const client = new VwvClient(http, indexPath());
    await Promise.all([client.getTitleIndex(), client.getTitleIndex()]);
    const before = http.get.mock.calls.length;
    await client.getTitleIndex();
    expect(http.get.mock.calls.length).toBe(before);
  });

  it('reuses the index from disk on a fresh client', async () => {
    const path = indexPath();
    const first = stubHttp(PORTAL);
    await new VwvClient(first, path).getTitleIndex();
    const second = stubHttp(PORTAL);
    const index = await new VwvClient(second, path).getTitleIndex();
    expect(index.length).toBeGreaterThan(30);
    expect(second.get).not.toHaveBeenCalled();
  });

  it('keeps the index when one ministry listing fails', async () => {
    // One unreachable listing costs its own regulations, not the whole index.
    let calls = 0;
    const http = {
      get: vi.fn(async (url: string) => {
        if (url.includes('erlassstellen')) return { data: latin1('erlassstellen.html') };
        calls += 1;
        if (calls % 2 === 0) throw new Error('ETIMEDOUT');
        return { data: latin1('teilliste-bmf.html') };
      }),
      post: vi.fn(),
    };
    const index = await new VwvClient(http, indexPath()).getTitleIndex();
    expect(index.length).toBeGreaterThan(0);
  });

  it('resolves a title for a known id and nothing for an unknown one', async () => {
    const client = new VwvClient(stubHttp(PORTAL), indexPath());
    const [entry] = await client.getTitleIndex();
    expect(await client.titleOf(entry!.docId)).toBe(entry!.title);
    expect(await client.titleOf('gibt-es-nicht')).toBeUndefined();
  });

  it('fetches a document and reports its canonical URL', async () => {
    const client = new VwvClient(stubHttp(PORTAL), indexPath());
    const doc = await client.getDocument('BMF-IIA3-20181002-H-05-01-2-KF-015-A009');
    expect(doc.title).toContain('ANBest-I');
    expect(client.documentUrl('x')).toBe(
      'https://www.verwaltungsvorschriften-im-internet.de/x.htm',
    );
  });
});
