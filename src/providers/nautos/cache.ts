import { join } from 'path';
import { readFile, mkdir, readdir, stat, unlink, utimes } from 'fs/promises';
import { createHash } from 'crypto';
import type { TocSection, DocumentDetail } from './client.js';
import { cachePath } from '../../shared/state-paths.js';
import { atomicWriteJson } from '../../shared/persistence.js';

const CACHE_DIR = cachePath('nautos');
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 500;

export interface CachedDocument {
  acCode: string;
  din21Id: string;
  detail: DocumentDetail;
  toc: TocSection[];
  sections: Record<string, string>; // sectionId → markdown
  fetchedAt: number;
}

function docPath(acCode: string): string {
  const hash = createHash('sha256').update(acCode).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${hash}.json`);
}

async function ensureDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

export async function get(acCode: string): Promise<CachedDocument | null> {
  try {
    const path = docPath(acCode);
    const raw = await readFile(path, 'utf-8');
    const doc: CachedDocument = JSON.parse(raw);
    if (Date.now() - doc.fetchedAt > TTL_MS) return null;
    const now = new Date();
    await utimes(path, now, now).catch(() => {});
    return doc;
  } catch { return null; }
}

export async function put(doc: CachedDocument): Promise<void> {
  await ensureDir();
  await atomicWriteJson(docPath(doc.acCode), doc, { serialize: true });
  evict().catch(() => {});
}

export async function putSection(acCode: string, sectionId: string, markdown: string): Promise<void> {
  const doc = await get(acCode);
  if (!doc) return;
  doc.sections[sectionId] = markdown;
  await atomicWriteJson(docPath(acCode), doc, { serialize: true });
}

let isEvicting = false;

async function evict(): Promise<void> {
  if (isEvicting) return;
  isEvicting = true;
  try {
    const files = await readdir(CACHE_DIR);
    if (files.length <= MAX_ENTRIES) return;
    const entries = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f => {
        const p = join(CACHE_DIR, f);
        const s = await stat(p);
        return { path: p, mtime: s.mtimeMs };
      }),
    );
    entries.sort((a, b) => a.mtime - b.mtime);
    const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
    await Promise.all(toRemove.map(e => unlink(e.path)));
  } catch { /* best effort */ } finally {
    isEvicting = false;
  }
}
