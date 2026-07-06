import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { searchBayern, fetchBayernDecision, convertBayernDecision } = vi.hoisted(() => ({
  searchBayern: vi.fn(),
  fetchBayernDecision: vi.fn(),
  convertBayernDecision: vi.fn(),
}));
vi.mock('./client.js', () => ({ searchBayern, fetchBayernDecision }));
vi.mock('./converter.js', () => ({ convertBayernDecision }));

import { handleBayernSearch, handleBayernGetDecision } from './handler.js';

const decision = {
  title: 'BayObLG, Beschluss v. 01.01.2020',
  fileNumber: '1 Z 2/20',
  court: 'BayObLG',
  date: '2020-01-01',
  fundstelle: 'BeckRS 2020, 1',
  normenketten: ['BGB § 535', 'BGB § 536'],
  leitsaetze: ['Erster Leitsatz.', 'Zweiter Leitsatz.'],
  content: 'Die zulässige Berufung ist begründet. '.repeat(8),
};

beforeEach(() => { searchBayern.mockReset(); fetchBayernDecision.mockReset(); convertBayernDecision.mockReset(); });

describe('handleBayernSearch', () => {
  it('formats decision hits into a numbered list', async () => {
    searchBayern.mockResolvedValue([
      { title: 'BayObLG Beschluss', docId: 'Y-1', subtitle: 'Leitsatz' },
    ]);
    const res = await handleBayernSearch({ query: 'miete' });
    expect(res.content[0].text).toContain('Found 1 results');
    expect(res.content[0].text).toContain('Y-1');
    expect(res.content[0].text).toContain('Leitsatz');
  });

  it('reports an empty result set', async () => {
    searchBayern.mockResolvedValue([]);
    const res = await handleBayernSearch({ query: 'nothing' });
    expect(res.content[0].text).toBe('No results found.');
  });
});

describe('handleBayernGetDecision', () => {
  beforeEach(() => {
    fetchBayernDecision.mockResolvedValue('<html>raw</html>');
    convertBayernDecision.mockReturnValue(decision);
  });

  it('renders the decision header and body as markdown', async () => {
    const res = await handleBayernGetDecision({ doc_id: 'Y-1' });
    const text = res.content[0].text;
    expect(text).toContain('# BayObLG, Beschluss');
    expect(text).toContain('**Gericht:** BayObLG');
    expect(text).toContain('**Normenketten:** BGB § 535; BGB § 536');
    expect(text).toContain('## Leitsätze');
    expect(text).toContain('1. Erster Leitsatz.');
  });

  it('extracts a requested section', async () => {
    const res = await handleBayernGetDecision({ doc_id: 'Y-1', section: 'Leitsätze' });
    expect(res.content[0].text).toContain('Leitsatz');
  });

  it('saves to a file when a save_path is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bayern-save-'));
    try {
      const file = join(dir, 'decision.md');
      const res = await handleBayernGetDecision({ doc_id: 'Y-1', save_path: file });
      expect(res.content[0].text).toMatch(/saved|gespeichert|→|wrote/i);
      expect(await readFile(file, 'utf-8')).toContain('BayObLG');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

afterEach(() => vi.restoreAllMocks());
