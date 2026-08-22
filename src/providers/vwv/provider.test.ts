import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { VwvProvider } from './provider.js';
import { VwvClient } from './client.js';

const FIXTURES = join(process.cwd(), 'src/providers/vwv/__fixtures__');
const latin1 = (name: string) =>
  Buffer.from(readFileSync(join(FIXTURES, name), 'utf-8'), 'latin1');

function provider(): VwvProvider {
  const http = {
    get: vi.fn(async (url: string) => {
      if (url.includes('erlassstellen')) return { data: latin1('erlassstellen.html') };
      if (url.includes('Teilliste_Bundesministerium_der_Finanzen')) {
        return { data: latin1('teilliste-bmf.html') };
      }
      if (url.includes('Teilliste_')) return { data: latin1('teilliste-bmfsfj.html') };
      return { data: latin1('dokument-anbest-i.html') };
    }),
    post: vi.fn(async () => ({ data: latin1('suchergebnis.html') })),
  };
  return new VwvProvider(
    new VwvClient(http, join(tmpdir(), `vwv-${randomUUID()}.json`)),
  );
}

const text = (result: { content: Array<{ text: string }> }): string =>
  result.content.map((block) => block.text).join('\n');

describe('VwvProvider', () => {
  it('exposes exactly the three vwv tools', () => {
    expect(provider().getTools().map((tool) => tool.name))
      .toEqual(['vwv:search', 'vwv:get', 'vwv:issuers']);
  });

  it('rejects an unknown tool', async () => {
    const result = await provider().handleToolCall('vwv:nope', {});
    expect(result.isError).toBe(true);
  });

  it('renders hits with the titles the ministry listings supply', async () => {
    const rendered = text(await provider().handleToolCall('vwv:search', {
      query: 'Nebenbestimmungen',
    }));
    expect(rendered).toContain('BMF-IIA2-21122017-H-08-10-KF-001-A003');
    expect(rendered).toContain('Ressort');
  });

  it('says when hits are annexes the listings do not name', async () => {
    // The portal indexes annexes that appear in no ministry listing. A silent
    // dash in the title column reads as a defect; naming the reason does not.
    const rendered = text(await provider().handleToolCall('vwv:search', {
      query: 'Nebenbestimmungen',
    }));
    expect(rendered).toContain('Anlagen ohne Titel');
    expect(rendered).toContain('vwv:get');
  });

  it('reports an empty result without pretending nothing is regulated', async () => {
    const http = {
      get: vi.fn(async () => ({ data: latin1('erlassstellen.html') })),
      post: vi.fn(async () => ({ data: Buffer.from('<html><body>nichts</body></html>') })),
    };
    const empty = new VwvProvider(new VwvClient(http, join(tmpdir(), `${randomUUID()}.json`)));
    const rendered = text(await empty.handleToolCall('vwv:search', { query: 'xyzzy' }));
    expect(rendered).toContain('Keine Verwaltungsvorschrift');
    expect(rendered).toContain('vwv:issuers');
  });

  it('retrieves a regulation and names the one it is an annex to', async () => {
    const rendered = text(await provider().handleToolCall('vwv:get', {
      doc_id: 'BMF-IIA3-20181002-H-05-01-2-KF-015-A009',
    }));
    expect(rendered).toContain('ANBest-I');
    expect(rendered).toContain('Anlage zu: Allgemeine Verwaltungsvorschriften zur Bundeshaushaltsordnung');
    expect(rendered).toContain('Quelle: https://www.verwaltungsvorschriften-im-internet.de/');
  });

  it('extracts a requested part of a regulation', async () => {
    const rendered = text(await provider().handleToolCall('vwv:get', {
      doc_id: 'BMF-IIA3-20181002-H-05-01-2-KF-015-A009',
      section: 'lines:1-3',
    }));
    expect(rendered.length).toBeGreaterThan(0);
  });

  it('reports a document id that yields no content', async () => {
    const http = {
      get: vi.fn(async () => ({ data: Buffer.from('<html><body></body></html>') })),
      post: vi.fn(),
    };
    const bare = new VwvProvider(new VwvClient(http, join(tmpdir(), `${randomUUID()}.json`)));
    const result = await bare.handleToolCall('vwv:get', { doc_id: 'leer' });
    expect(result.isError).toBe(true);
  });

  it('counts the regulations per ministry', async () => {
    const rendered = text(await provider().handleToolCall('vwv:issuers', {}));
    expect(rendered).toContain('Verwaltungsvorschriften des Bundes');
    expect(rendered).toMatch(/Bundesministerium[^:]*: \d+/);
  });

  it('shuts down cleanly', async () => {
    await expect(provider().shutdown()).resolves.toBeUndefined();
  });
});
