import { describe, it, expect } from 'vitest';
import { RisClient } from './client.js';
import { risHtmlToMarkdown } from './converter.js';

/**
 * OPT-IN live test against the real RIS OGD API (data.bka.gv.at).
 *
 * Skipped unless GLMCP_RIS_LIVE is set, so CI and offline runs stay hermetic
 * (the default suite is fixture-backed — see ris.flow.test.ts). Run on demand,
 * e.g. before a release, to catch real contract drift:
 *
 *   npm run test:live
 */
const LIVE = Boolean(process.env.GLMCP_RIS_LIVE);

describe('RIS live integration (opt-in via GLMCP_RIS_LIVE)', () => {
  it.skipIf(!LIVE)('searches Judikatur newest-first (sort=date), then fetches + converts the linked decision', async () => {
    const client = new RisClient();

    const result = await client.search('judikatur', {
      query: 'Vertrag',
      court: 'Justiz',
      sort: 'date',
      limit: 5,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.hits.length).toBeGreaterThan(0);

    // Newest-first ordering: the leading result is from the current decade.
    expect(result.hits[0]?.date?.slice(0, 3)).toBe('202');

    // Convert the linked Entscheidungstext (JJT) rather than the Rechtssatz page:
    // JJT decision documents serve fast, whereas some large Rechtssatz pages hang.
    const decision = result.hits.map((h) => h.decisionTexts?.[0]).find(Boolean);
    expect(decision?.id).toMatch(/^JJT/);
    const url = `https://www.ris.bka.gv.at/Dokumente/Justiz/${decision?.id}/${decision?.id}.html`;
    const markdown = risHtmlToMarkdown(await client.fetchHtml(url));
    expect(markdown.length).toBeGreaterThan(100);
  }, 45_000);

  it.skipIf(!LIVE)('searches consolidated federal law (Bundesrecht/BrKons)', async () => {
    const client = new RisClient();
    const result = await client.search('bundesrecht', { query: 'Urheberrechtsgesetz', limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.hits.length).toBeGreaterThan(0);
  }, 45_000);
});
