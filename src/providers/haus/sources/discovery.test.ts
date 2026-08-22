import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyPage,
  discoverReadingVersions,
  isAllowed,
  parseRobots,
  parseSitemap,
  renderDiscoveryReport,
} from './discovery.js';
import type { SitemapEntry } from './discovery.js';

const FIXTURES = join(process.cwd(), 'src/providers/haus/sources/__fixtures__');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

const GO_AS = 'https://www.bht-berlin.de/589';
const BENUTZUNG = 'https://www.bht-berlin.de/1004';

/** The live robots.txt, as fetched from the site. */
const ROBOTS = `# Beuth Hochschule fuer Technik Berlin

User-Agent: *
Disallow: /misc/
Disallow: /typo3/
Disallow: /fileadmin/intern/
Disallow: /uploads/
`;

describe('parseSitemap', () => {
  it('reads locations with their lastmod and priority', () => {
    const entries = parseSitemap(fixture('bht-sitemap.xml'));
    expect(entries.length).toBeGreaterThan(4);
    const goAs = entries.find((entry) => entry.url === GO_AS);
    expect(goAs?.lastmod).toBe('2015-10-28');
    expect(goAs?.priority).toBe(0.5);
  });

  it('records the lastmod the site reports even where it is demonstrably wrong', () => {
    // /589 states "in der Fassung vom 16.07.2026" in its own text. The sitemap
    // says 2015-10-28. The field is carried, never trusted to gate a re-fetch.
    const goAs = parseSitemap(fixture('bht-sitemap.xml')).find((e) => e.url === GO_AS);
    const page = classifyPage(fixture('bht-web-go-as.html'), GO_AS);
    expect(goAs?.lastmod).toBe('2015-10-28');
    expect(typeof page === 'string' ? undefined : page.asOf).toBe('2026-07-16');
  });

  it('returns nothing for a sitemap with no entries', () => {
    expect(parseSitemap('<urlset></urlset>')).toEqual([]);
  });
});

describe('parseRobots', () => {
  it('reads the wildcard group off the live file', () => {
    expect(parseRobots(ROBOTS).disallow).toEqual([
      '/misc/', '/typo3/', '/fileadmin/intern/', '/uploads/',
    ]);
  });

  it('treats an empty Disallow as permitting everything, not forbidding it', () => {
    // "Disallow:" with no value allows the whole site. Kept as a prefix it
    // would match every path and the crawl would visit nothing.
    expect(parseRobots('User-agent: *\nDisallow:\n').disallow).toEqual([]);
    expect(isAllowed(GO_AS, parseRobots('User-agent: *\nDisallow:\n'))).toBe(true);
  });

  it('ignores groups addressed to a different agent', () => {
    const rules = parseRobots('User-agent: SomeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /x/\n');
    expect(rules.disallow).toEqual(['/x/']);
  });

  it('strips comments', () => {
    expect(parseRobots('User-agent: *\nDisallow: /a/ # weg\n').disallow).toEqual(['/a/']);
  });
});

describe('isAllowed', () => {
  it('blocks disallowed prefixes and permits the rest', () => {
    const rules = parseRobots(ROBOTS);
    expect(isAllowed(GO_AS, rules)).toBe(true);
    expect(isAllowed('https://www.bht-berlin.de/fileadmin/intern/x.pdf', rules)).toBe(false);
    expect(isAllowed('https://www.bht-berlin.de/typo3/', rules)).toBe(false);
  });

  it('refuses a URL it cannot parse rather than assuming it is fine', () => {
    expect(isAllowed('not a url', { disallow: [] })).toBe(false);
  });
});

describe('classifyPage', () => {
  it('accepts a page that carries its rule as § headings', () => {
    const result = classifyPage(fixture('bht-web-go-as.html'), GO_AS);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.sectionCount).toBeGreaterThan(20);
    expect(result.declaresReadingVersion).toBe(true);
    expect(result.asOf).toBe('2026-07-16');
  });

  it('accepts a page that never says "Lesefassung"', () => {
    const result = classifyPage(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.declaresReadingVersion).toBe(false);
  });

  it('rejects a page that merely mentions a paragraph', () => {
    const html = '<html><body><main><h2>Aktuelles</h2><p>Nach § 5 gilt …</p></main></body></html>';
    expect(classifyPage(html, 'https://www.bht-berlin.de/x')).toBe('too-few-sections');
  });

  it('rejects an empty page', () => {
    expect(classifyPage('<html><body></body></html>', 'https://www.bht-berlin.de/x'))
      .toBe('no-content');
  });

  it('honours a raised threshold', () => {
    expect(classifyPage(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG, 50))
      .toBe('too-few-sections');
  });
});

describe('discoverReadingVersions', () => {
  const entries: SitemapEntry[] = [
    { url: GO_AS, lastmod: '2015-10-28' },
    { url: BENUTZUNG },
    { url: 'https://www.bht-berlin.de/termine' },
    { url: 'https://www.bht-berlin.de/typo3/' },
    { url: 'https://www.bht-berlin.de/kaputt' },
  ];

  const fetchPage = async (url: string): Promise<string | null> => {
    if (url === GO_AS) return fixture('bht-web-go-as.html');
    if (url === BENUTZUNG) return fixture('bht-web-benutzungsordnung.html');
    if (url.endsWith('/termine')) return '<html><body><main><p>Termine</p></main></body></html>';
    return null;
  };

  it('finds the Ordnungen and says why it skipped the rest', async () => {
    const report = await discoverReadingVersions({
      entries,
      fetchPage,
      robots: parseRobots(ROBOTS),
    });
    expect(report.candidates.map((c) => c.url)).toEqual([GO_AS, BENUTZUNG]);
    expect(report.visited).toBe(4);
    expect(report.rejected).toContainEqual({
      url: 'https://www.bht-berlin.de/typo3/', reason: 'robots-disallowed',
    });
    expect(report.rejected).toContainEqual({
      url: 'https://www.bht-berlin.de/kaputt', reason: 'fetch-failed',
    });
    expect(report.rejected).toContainEqual({
      url: 'https://www.bht-berlin.de/termine', reason: 'too-few-sections',
    });
  });

  it('never fetches what robots.txt disallows', async () => {
    const spy = vi.fn(fetchPage);
    await discoverReadingVersions({ entries, fetchPage: spy, robots: parseRobots(ROBOTS) });
    expect(spy).not.toHaveBeenCalledWith('https://www.bht-berlin.de/typo3/');
  });

  it('ranks declared reading versions first, then by size', async () => {
    const report = await discoverReadingVersions({ entries, fetchPage });
    expect(report.candidates[0]?.url).toBe(GO_AS);
    expect(report.candidates[0]?.declaresReadingVersion).toBe(true);
  });

  it('carries the sitemap lastmod onto the candidate for comparison', async () => {
    const report = await discoverReadingVersions({ entries, fetchPage });
    const goAs = report.candidates.find((c) => c.url === GO_AS);
    expect(goAs?.lastmod).toBe('2015-10-28');
    expect(goAs?.asOf).toBe('2026-07-16');
  });

  it('survives a fetcher that throws instead of returning null', async () => {
    const report = await discoverReadingVersions({
      entries: [{ url: GO_AS }],
      fetchPage: async () => { throw new Error('ECONNRESET'); },
    });
    expect(report.rejected).toEqual([{ url: GO_AS, reason: 'fetch-failed' }]);
  });

  it('names the unreachable pages instead of only counting them', async () => {
    const report = await discoverReadingVersions({ entries, fetchPage });
    expect(renderDiscoveryReport(report)).toContain('https://www.bht-berlin.de/kaputt');
  });

  it('streams each result so a long run can checkpoint', async () => {
    const seen: string[] = [];
    await discoverReadingVersions({
      entries,
      fetchPage,
      robots: parseRobots(ROBOTS),
      onResult: (result) => {
        seen.push(`${result.kind === 'candidate' ? 'ok' : result.reason}:${result.url}`);
      },
    });
    expect(seen).toContain(`ok:${GO_AS}`);
    expect(seen).toContain('fetch-failed:https://www.bht-berlin.de/kaputt');
    expect(seen).toContain('robots-disallowed:https://www.bht-berlin.de/typo3/');
    expect(seen).toHaveLength(entries.length);
  });

  it('reports progress for every page it visits', async () => {
    const seen: string[] = [];
    await discoverReadingVersions({
      entries,
      fetchPage,
      robots: parseRobots(ROBOTS),
      onProgress: (_visited, _total, url) => { seen.push(url); },
    });
    expect(seen).toHaveLength(4);
    expect(seen).not.toContain('https://www.bht-berlin.de/typo3/');
  });
});

describe('renderDiscoveryReport', () => {
  it('lists candidates and states what a person still has to supply', async () => {
    const report = await discoverReadingVersions({
      entries: [{ url: GO_AS, lastmod: '2015-10-28' }],
      fetchPage: async () => fixture('bht-web-go-as.html'),
    });
    const rendered = renderDiscoveryReport(report);
    expect(rendered).toContain('1 Kandidat(en)');
    expect(rendered).toContain(GO_AS);
    expect(rendered).toContain('2026-07-16');
    expect(rendered).toContain('authoritativeSource');
    expect(rendered).toContain('keine Webseite ist der amtliche Text');
  });

  it('summarises the rejection reasons', async () => {
    const report = await discoverReadingVersions({
      entries: [{ url: 'https://www.bht-berlin.de/x' }],
      fetchPage: async () => '<html><body><main><p>nichts</p></main></body></html>',
    });
    expect(renderDiscoveryReport(report)).toContain('too-few-sections 1');
  });
});
