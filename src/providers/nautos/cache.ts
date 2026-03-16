import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import type { TocSection, DocumentDetail } from './client.js';

const CACHE_DIR = join(homedir(), '.local', 'share', 'german-legal-mcp', 'cache', 'nautos');
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
    const raw = await readFile(docPath(acCode), 'utf-8');
    const doc: CachedDocument = JSON.parse(raw);
    if (Date.now() - doc.fetchedAt > TTL_MS) return null;
    return doc;
  } catch { return null; }
}

export async function put(doc: CachedDocument): Promise<void> {
  await ensureDir();
  await writeFile(docPath(doc.acCode), JSON.stringify(doc), 'utf-8');
  evict().catch(() => {});
}

export async function putSection(acCode: string, sectionId: string, markdown: string): Promise<void> {
  const doc = await get(acCode);
  if (!doc) return;
  doc.sections[sectionId] = markdown;
  await writeFile(docPath(acCode), JSON.stringify(doc), 'utf-8');
}

async function evict(): Promise<void> {
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
  } catch { /* best effort */ }
}
