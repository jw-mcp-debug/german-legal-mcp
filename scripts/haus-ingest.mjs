#!/usr/bin/env node
/**
 * Fill the house index from the two BHT corpora.
 *
 *   node scripts/haus-ingest.mjs --opus-limit 25
 *   node scripts/haus-ingest.mjs --web-from lesefassungen.md
 *   node scripts/haus-ingest.mjs --opus-limit 0 --web https://www.bht-berlin.de/589
 *
 * OPUS records are the promulgated text: search pages give the docIds, the
 * frontdoor gives the declared metadata, the linked PDF gives the body. Web
 * pages are consolidated reading versions and are marked as such.
 *
 * `owner` and `authoritativeSource` for web pages are NOT invented here. OPUS
 * declares its own owner; web pages do not, and the field stays empty until a
 * person supplies it.
 */
import { readFileSync } from 'node:fs';
import { HausIndexStore } from '../dist/providers/haus/store.js';
import { ingestDocument } from '../dist/providers/haus/ingest.js';
import {
  parseFrontdoor,
  parseSearchResultIds,
  toIngestInput as opusToIngest,
} from '../dist/providers/haus/sources/opus4.js';
import {
  parseReadingVersion,
  toIngestInput as webToIngest,
} from '../dist/providers/haus/sources/bht-web.js';
import { pdfToMarkdown } from '../dist/providers/haus/sources/pdf.js';

const OPUS = 'https://opus4.kobv.de/opus4-bht';
const SEARCH = `${OPUS}/solrsearch/index/search/searchtype/simple/query/%2A%3A%2A`
  + '/browsing/true/doctypefq/other/rows/100/start';
const UA = 'german-legal-mcp/haus-ingest (institutional rule indexing)';

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const opusLimit = Number(flag('opus-limit', '25'));
const delayMs = Number(flag('delay', '800'));
const indexPath = flag('index', process.env.GLMCP_HAUS_INDEX);
const webFrom = flag('web-from');
const webList = flag('web');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, as = 'text') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return as === 'text' ? res.text() : new Uint8Array(await res.arrayBuffer());
};

const store = new HausIndexStore(indexPath ?? (await import('../dist/shared/state-paths.js'))
  .statePath('haus', 'index.db'));
const tally = { created: 0, updated: 0, unchanged: 0, failed: 0, skipped: 0 };

if (opusLimit > 0) {
  console.error(`OPUS: reading search pages …`);
  const ids = [];
  for (const start of [0, 100]) {
    ids.push(...parseSearchResultIds(await get(`${SEARCH}/${start}`)));
    if (ids.length >= opusLimit) break;
    await sleep(delayMs);
  }
  const wanted = ids.slice(0, opusLimit);
  console.error(`OPUS: ${ids.length} records found, ingesting ${wanted.length}\n`);

  for (const [i, docId] of wanted.entries()) {
    const url = `${OPUS}/frontdoor/index/index/docId/${docId}`;
    process.stderr.write(`\r  [${i + 1}/${wanted.length}] docId ${docId}      `);
    try {
      await sleep(delayMs);
      const record = parseFrontdoor(await get(url), url);
      if (!record.fulltextUrl) { tally.skipped += 1; continue; }
      await sleep(delayMs);
      const { markdown } = await pdfToMarkdown(await get(record.fulltextUrl, 'bytes'));
      if (markdown.trim() === '') { tally.skipped += 1; continue; }
      tally[ingestDocument(store, opusToIngest(record, markdown))] += 1;
    } catch {
      tally.failed += 1;
    }
  }
  process.stderr.write('\n');
}

let webUrls = [];
if (webList) webUrls = webList.split(',').map((s) => s.trim()).filter(Boolean);
if (webFrom) {
  // The discovery report's table links each candidate; take the URLs from it.
  const report = readFileSync(webFrom, 'utf-8');
  webUrls.push(...[...report.matchAll(/\]\((https:\/\/www\.bht-berlin\.de\/[^)]+)\)/g)]
    .map((m) => m[1]));
}
webUrls = [...new Set(webUrls)];

if (webUrls.length > 0) {
  console.error(`\nWeb: ingesting ${webUrls.length} reading version(s)\n`);
  for (const [i, url] of webUrls.entries()) {
    process.stderr.write(`\r  [${i + 1}/${webUrls.length}] ${url.slice(0, 50)}      `);
    try {
      await sleep(delayMs);
      const page = parseReadingVersion(await get(url), url);
      if (page.markdown.trim() === '') { tally.skipped += 1; continue; }
      tally[ingestDocument(store, webToIngest(page, { url }))] += 1;
    } catch {
      tally.failed += 1;
    }
  }
  process.stderr.write('\n');
}

console.error(`\nneu ${tally.created} · aktualisiert ${tally.updated} · unverändert `
  + `${tally.unchanged} · übersprungen ${tally.skipped} · fehlgeschlagen ${tally.failed}`);
console.error(`Index: ${store.count()} gültige Dokumente`);
store.close();
