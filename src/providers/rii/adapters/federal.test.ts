import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { FederalDecisionAdapter } from './federal.js';

describe('FederalDecisionAdapter', () => {
  it('regresses search and conversion against a real RII-shaped HTML sample', async () => {
    const html = await readFile(new URL('./fixtures/federal-decision.html', import.meta.url), 'utf8');
    const http = { get: vi.fn(async (_url: string, options?: { params?: Record<string, string> }) => ({ data: options?.params?.['doc.id'] ? html : '<a class="TrefferlisteHervorheben" id="tlid1" href="?doc.id=case-1" title="BGH, Urteil">BGH, Urteil</a>' })) };
    const adapter = new FederalDecisionAdapter(http);
    await expect(adapter.search('BUND', 'copyright', 1)).resolves.toMatchObject([{ id: 'case-1', title: 'BGH, Urteil' }]);
    await expect(adapter.get('BUND', 'case-1')).resolves.toMatchObject({ court: 'BGH', fileNumber: 'I ZR 1/25', ecli: 'ECLI:DE:BGH:2021:090421UIZR1.25.0', content: expect.stringContaining('Die Klage ist zulässig') });
  });
});
