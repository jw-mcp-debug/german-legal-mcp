import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OldataProvider } from './provider.js';
import { OldataClient } from './client.js';

const FIXTURES = join(process.cwd(), 'src/providers/oldata/__fixtures__');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));

const provider = (data: unknown) =>
  new OldataProvider(new OldataClient({ get: vi.fn(async () => ({ data })) }));

const text = (result: { content: Array<{ text: string }> }): string =>
  result.content.map((block) => block.text).join('\n');

describe('OldataProvider', () => {
  it('exposes exactly the two oldata tools', () => {
    expect(provider({}).getTools().map((t) => t.name))
      .toEqual(['oldata:search', 'oldata:get']);
  });

  it('rejects an unknown tool', async () => {
    expect((await provider({}).handleToolCall('oldata:nope', {})).isError).toBe(true);
  });

  it('shows the court, its branch and the instance in the hit list', async () => {
    const rendered = text(await provider(fixture('search.json'))
      .handleToolCall('oldata:search', { query: 'Befristung' }));
    expect(rendered).toContain('LAGBW');
    expect(rendered).toContain('Arbeitsgerichtsbarkeit');
    expect(rendered).toContain('Gerichtsbarkeit');
  });

  it('reports a capped count as a floor, not as a total', async () => {
    const rendered = text(await provider({ count: 10000, results: [{ id: 1, court: 'X', date: '2020-01-01', slug: 's' }] })
      .handleToolCall('oldata:search', { query: 'Vertrag' }));
    expect(rendered).toContain('mindestens 10000');
    expect(rendered).toContain('zählt nicht weiter');
  });

  it('re-checks an empty filtered result before calling it a finding', async () => {
    // The source's jurisdiction filter returns nothing for values that its own
    // hits carry. Reported unchecked, an API quirk reads as "no such case law".
    let call = 0;
    const client = new OldataClient({
      get: vi.fn(async () => {
        call += 1;
        return { data: call === 1 ? { count: 0, results: [] } : fixture('search.json') };
      }),
    });
    const rendered = text(await new OldataProvider(client).handleToolCall('oldata:search', {
      query: 'Befristung', jurisdiction: 'Ordentliche Gerichtsbarkeit',
    }));
    expect(rendered).toContain('mit dieser Einschränkung');
    expect(rendered).toContain('unzuverlässig');
    expect(rendered).toContain('337');
  });

  it('reports a genuinely empty search as empty', async () => {
    const rendered = text(await provider({ count: 0, results: [] })
      .handleToolCall('oldata:search', { query: 'xyzzy' }));
    expect(rendered).toContain('Keine Entscheidungen');
    expect(rendered).toContain('rii:');
  });

  it('retrieves a decision with its metadata header', async () => {
    const rendered = text(await provider(fixture('case.json'))
      .handleToolCall('oldata:get', { id: '183341' }));
    expect(rendered).toContain('Landesarbeitsgericht Baden-Württemberg · 12 Sa 28/18');
    expect(rendered).toContain('Datum: 2018-09-28');
    expect(rendered).toContain('Quelle: https://de.openlegaldata.io/case/183341');
  });

  it('extracts a named part of a judgment', async () => {
    const rendered = text(await provider(fixture('case.json'))
      .handleToolCall('oldata:get', { id: '183341', section: 'Tenor' }));
    expect(rendered).toContain('Tenor');
    expect(rendered).not.toContain('## Gründe');
  });

  it('reports an id that yields no text', async () => {
    const result = await provider({ id: 1, court: { name: 'X' }, file_number: 'a', date: 'd', content: '' })
      .handleToolCall('oldata:get', { id: '1' });
    expect(result.isError).toBe(true);
  });

  it('shuts down cleanly', async () => {
    await expect(provider({}).shutdown()).resolves.toBeUndefined();
  });
});
