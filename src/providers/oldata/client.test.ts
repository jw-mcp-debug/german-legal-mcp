import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COUNT_CAP, OldataClient } from './client.js';

const FIXTURES = join(process.cwd(), 'src/providers/oldata/__fixtures__');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));

function stub(data: unknown) {
  return { get: vi.fn(async () => ({ data })) };
}

describe('OldataClient.search', () => {
  it('maps hits and keeps the branch of the court system', async () => {
    const http = stub(fixture('search.json'));
    const page = await new OldataClient(http).search('Befristung');
    expect(page.total).toBe(337);
    expect(page.totalIsCapped).toBe(false);
    expect(page.hits[0]?.court).toBe('LAGBW');
    expect(page.hits[0]?.jurisdiction).toBe('Arbeitsgerichtsbarkeit');
  });

  it('marks the count as a floor once the endpoint stops counting', async () => {
    // The API reports 10.000 for anything broader, which is a ceiling and not
    // a total; presenting it as one would overstate what the source said.
    const page = await new OldataClient(stub({ count: COUNT_CAP, results: [] }))
      .search('Vertrag');
    expect(page.totalIsCapped).toBe(true);
  });

  it('passes the filters through as query parameters', async () => {
    const http = stub(fixture('search.json'));
    await new OldataClient(http).search('Frist', {
      jurisdiction: 'Arbeitsgerichtsbarkeit', court: 'LAGBW',
    });
    expect(http.get.mock.calls[0]![1].params).toMatchObject({
      text: 'Frist', court_jurisdiction: 'Arbeitsgerichtsbarkeit', court: 'LAGBW',
    });
  });

  it('marks the search terms in the snippet', async () => {
    const page = await new OldataClient(stub(fixture('search.json'))).search('Befristung');
    expect(page.hits[0]?.snippet).toContain('«');
    expect(page.hits[0]?.snippet).not.toContain('<em>');
  });

  it('reads "None" and an empty string as absent, because the API means them so', async () => {
    const page = await new OldataClient(stub({
      count: 1,
      results: [{ id: 1, court: 'X', date: '2020-01-01', slug: 's', court_level_of_appeal: 'None', decision_type: '' }],
    })).search('x');
    expect(page.hits[0]?.levelOfAppeal).toBeUndefined();
    expect(page.hits[0]?.decisionType).toBeUndefined();
  });

  it('honours the requested limit', async () => {
    const page = await new OldataClient(stub(fixture('search.json'))).search('x', { limit: 2 });
    expect(page.hits).toHaveLength(2);
  });
});

describe('OldataClient.getCase', () => {
  it('converts the decision to Markdown with its metadata', async () => {
    const record = await new OldataClient(stub(fixture('case.json'))).getCase('183341');
    expect(record.court).toBe('Landesarbeitsgericht Baden-Württemberg');
    expect(record.fileNumber).toBe('12 Sa 28/18');
    expect(record.decisionType).toBe('Urteil');
    expect(record.markdown).toContain('## Tenor');
    expect(record.markdown).not.toContain('<div');
  });

  it('drops a placeholder source URL rather than offering a dead citation', async () => {
    const record = await new OldataClient(stub({
      id: 1, court: { name: 'X' }, file_number: 'a', date: '2020-01-01',
      content: '<p>Text</p>', source_url: 'http://example.com',
    })).getCase('1');
    expect(record.sourceUrl).toBeUndefined();
  });

  it('keeps a real source URL', async () => {
    const record = await new OldataClient(stub(fixture('case.json'))).getCase('183341');
    expect(record.sourceUrl).toContain('juris.de');
  });

  it('builds a citable case URL', () => {
    expect(new OldataClient(stub({})).caseUrl('abc'))
      .toBe('https://de.openlegaldata.io/case/abc');
  });
});
