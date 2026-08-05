import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { BayernDecisionAdapter } from './bayern.js';

describe('BayernDecisionAdapter', () => {
  it('regresses search and conversion against a real gesetze-bayern-shaped HTML sample', async () => {
    const html = await readFile(new URL('./fixtures/bayern-decision.html', import.meta.url), 'utf8');
    const adapter = new BayernDecisionAdapter({
      search: async () => ({ results: [{ title: 'Mietminderung bei Schimmel', docId: 'Y-300-Z-BECKRS-2021-12345', subtitle: 'Der Mieter darf die Miete mindern.' }], totalHits: 2608 }),
      get: async () => html,
    });
    await expect(adapter.search('BY', 'Mietminderung', 1)).resolves.toMatchObject([{ id: 'Y-300-Z-BECKRS-2021-12345' }]);
    await expect(adapter.searchPage('BY', 'Mietminderung', 1)).resolves.toMatchObject({ totalHits: 2608 });
    await expect(adapter.get('BY', 'Y-300-Z-BECKRS-2021-12345')).resolves.toMatchObject({ court: 'AG München', fileNumber: '142 C 14251/20', content: expect.stringContaining('[Rn. 1]{.rn}') });
  });
});
