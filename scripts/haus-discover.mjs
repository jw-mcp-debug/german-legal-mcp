#!/usr/bin/env node
/**
 * Find the consolidated Ordnungen on the institution's website.
 *
 * Nothing on the site lists them — `/ordnungen` links promulgated PDFs, not
 * consolidated pages — so this walks `sitemap.xml`, which is the complete page
 * set, and keeps the pages that carry a rule as `§` headings.
 *
 * It REPORTS. It does not ingest: `owner` and `authoritativeSource` are not on
 * these pages, and a reviewed candidate list is where a person supplies them.
 *
 * Build first (`npm run build`), then:
 *
 *   node scripts/haus-discover.mjs                       # full run, ~1.272 pages
 *   node scripts/haus-discover.mjs --limit 25            # first 25 only
 *   node scripts/haus-discover.mjs --match 589,1004      # only matching URLs
 *   node scripts/haus-discover.mjs --delay 2000 --out bericht.md
 *
 * Pacing is serial with a delay between requests; robots.txt is fetched and
 * honoured, and the User-Agent says who is calling and why.
 */
import { writeFileSync } from 'node:fs';
import {
  discoverReadingVersions,
  parseRobots,
  parseSitemap,
  renderDiscoveryReport,
} from '../dist/providers/haus/sources/discovery.js';

const BASE = 'https://www.bht-berlin.de';
const USER_AGENT =
  'german-legal-mcp/haus-discovery (institutional rule indexing; contact: Gremienreferat)';

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const delayMs = Number(flag('delay', '1000'));
const limit = flag('limit') ? Number(flag('limit')) : undefined;
const match = flag('match');
const outPath = flag('out');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

console.error(`Reading ${BASE}/robots.txt and ${BASE}/sitemap.xml …`);
const robots = parseRobots(await get(`${BASE}/robots.txt`));
let entries = parseSitemap(await get(`${BASE}/sitemap.xml`));
console.error(`  ${entries.length} URLs, ${robots.disallow.length} disallow rules`);

if (match) {
  const needles = match.split(',').map((s) => s.trim()).filter(Boolean);
  entries = entries.filter((e) => needles.some((n) => e.url.includes(n)));
}
if (limit !== undefined) entries = entries.slice(0, limit);
console.error(`Visiting ${entries.length} page(s), ${delayMs} ms apart …\n`);

let first = true;
const report = await discoverReadingVersions({
  entries,
  robots,
  fetchPage: async (url) => {
    // Delay before every request but the first, so a run of one is immediate
    // and a long run stays at roughly one request per interval.
    if (!first) await sleep(delayMs);
    first = false;
    try {
      return await get(url);
    } catch {
      return null;
    }
  },
  onProgress: (visited, total, url) => {
    process.stderr.write(`\r  [${visited}/${total}] ${url.slice(0, 60).padEnd(60)}`);
  },
});

process.stderr.write('\n\n');
const rendered = renderDiscoveryReport(report);
if (outPath) {
  writeFileSync(outPath, `${rendered}\n`);
  console.error(`Report written to ${outPath}`);
} else {
  console.log(rendered);
}
