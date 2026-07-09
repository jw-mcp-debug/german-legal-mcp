import { join } from 'node:path';
import { readFile, mkdir, readdir, stat, unlink, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cachePath } from '../../shared/state-paths.js';
import { atomicWriteJson } from '../../shared/persistence.js';
import type { RisTocEntry } from './toc.js';

const CACHE_DIR = cachePath('ris-toc');
/** A consolidated law's structure is stable for months; a navigation aid can be stale. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 200;

export interface CachedToc {
  /** The whole-law ("Gesamte Rechtsvorschrift") URL this TOC was parsed from — the cache key. */
  url: string;
  title: string;
  entries: RisTocEntry[];
  fetchedAt: number;
}

/**
 * A table-of-contents cache. Parsing a law's TOC means fetching its whole-law
 * HTML, which RIS generates server-side and can take ~20 s for a large code
 * (ABGB). The structure changes rarely, so the result is cached and that cost
 * is paid at most once per law per TTL.
 */
export interface RisTocCache {
  get(url: string): Promise<CachedToc | null>;
  put(entry: CachedToc): Promise<void>;
}

/** Disk-backed cache: one JSON file per law under the state cache dir, LRU-evicted. */
export class DiskTocCache implements RisTocCache {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private evicting = false;

  constructor(opts: { dir?: string; ttlMs?: number; maxEntries?: number } = {}) {
    this.dir = opts.dir ?? CACHE_DIR;
    this.ttlMs = opts.ttlMs ?? TTL_MS;
    this.maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  }

  private filePath(url: string): string {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    return join(this.dir, `${hash}.json`);
  }

  async get(url: string): Promise<CachedToc | null> {
    try {
      const path = this.filePath(url);
      const doc = JSON.parse(await readFile(path, 'utf-8')) as CachedToc;
      // Reject stale OR structurally-invalid entries (a truncated/corrupt file
      // parses to an object where fetchedAt is undefined → NaN comparison → not
      // "> ttl" → would otherwise crash the caller on doc.entries).
      if (
        !doc ||
        typeof doc.fetchedAt !== 'number' ||
        !Array.isArray(doc.entries) ||
        Date.now() - doc.fetchedAt > this.ttlMs
      ) {
        await unlink(path).catch(() => {}); // drop the dead entry
        return null;
      }
      const now = new Date();
      await utimes(path, now, now).catch(() => {}); // touch for LRU
      return doc;
    } catch {
      return null;
    }
  }

  async put(entry: CachedToc): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await atomicWriteJson(this.filePath(entry.url), entry, { serialize: true });
    this.evict().catch(() => {});
  }

  private async evict(): Promise<void> {
    if (this.evicting) return;
    this.evicting = true;
    try {
      const files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'));
      if (files.length <= this.maxEntries) return;
      const entries = (
        await Promise.all(
          files.map(async (f) => {
            const p = join(this.dir, f);
            try {
              return { path: p, mtime: (await stat(p)).mtimeMs };
            } catch {
              return null; // vanished between readdir and stat — skip, don't abort eviction
            }
          }),
        )
      ).filter((e): e is { path: string; mtime: number } => e !== null);
      entries.sort((a, b) => a.mtime - b.mtime);
      await Promise.all(entries.slice(0, entries.length - this.maxEntries).map((e) => unlink(e.path)));
    } catch {
      /* best effort */
    } finally {
      this.evicting = false;
    }
  }
}
