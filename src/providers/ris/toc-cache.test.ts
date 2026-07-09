import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskTocCache, type CachedToc } from './toc-cache.js';

const sample = (url: string): CachedToc => ({
  url,
  title: 'ABGB',
  entries: [{ paragraph: '1295', heading: 'Schadenersatz' }],
  fetchedAt: Date.now(),
});

describe('DiskTocCache', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ris-toc-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips a stored TOC', async () => {
    const cache = new DiskTocCache({ dir });
    await cache.put(sample('https://x/abgb'));
    const got = await cache.get('https://x/abgb');
    expect(got?.entries).toEqual([{ paragraph: '1295', heading: 'Schadenersatz' }]);
  });

  it('returns null for an unknown key', async () => {
    const cache = new DiskTocCache({ dir });
    expect(await cache.get('https://x/never')).toBeNull();
  });

  it('treats a corrupt cache file as a miss and removes it', async () => {
    const cache = new DiskTocCache({ dir });
    await cache.put(sample('https://x/corrupt'));
    const [file] = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    // A truncated write leaves valid JSON without the expected shape.
    await writeFile(join(dir, file!), '{"entries":null}');
    expect(await cache.get('https://x/corrupt')).toBeNull();
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(0);
  });

  it('treats an entry older than the TTL as a miss', async () => {
    const cache = new DiskTocCache({ dir, ttlMs: 1000 });
    await cache.put({ ...sample('https://x/stale'), fetchedAt: Date.now() - 10_000 });
    expect(await cache.get('https://x/stale')).toBeNull();
  });

  it('evicts the least-recently-used entries beyond the cap', async () => {
    const cache = new DiskTocCache({ dir, maxEntries: 2 });
    await cache.put(sample('https://x/a'));
    await cache.put(sample('https://x/b'));
    await cache.put(sample('https://x/c'));
    // Give the best-effort eviction a tick to complete.
    await sleep(20);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeLessThanOrEqual(2);
  });
});
