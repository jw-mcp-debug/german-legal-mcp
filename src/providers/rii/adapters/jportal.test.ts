import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JPortalDecisionAdapter } from './jportal.js';

describe('JPortalDecisionAdapter', () => {
  it('converts an authentic jPortal-shaped decision document', async () => {
    const text = await readFile(new URL('./fixtures/jportal-decision.html', import.meta.url), 'utf8');
    const adapter = new JPortalDecisionAdapter({
      search: async () => ({
        results: [{ docId: 'NJRE001474266', title: 'OVG Schleswig-Holstein', subtitle: 'Beschluss', category: 'Rechtsprechung', date: '30.07.2021', docPart: 'L', snippet: 'Auslegung der Widerspruchserhebung' }],
        totalHits: 2148,
      }),
      get: async () => ({ title: 'Freizeitausgleich für Bereitschaftsdienstzeiten', head: text.slice(0, text.indexOf('<div class="docLayoutNavigation">')), text: text.slice(text.indexOf('<div class="decision">')), permalink: 'https://www.gesetze-rechtsprechung.sh.juris.de/NJRE001474266' }),
    });
    await expect(adapter.search('SH', 'VwVfG', 1)).resolves.toMatchObject([{ id: 'NJRE001474266', snippet: 'Auslegung der Widerspruchserhebung' }]);
    await expect(adapter.get('SH', 'NJRE001474266')).resolves.toMatchObject({ court: 'Oberverwaltungsgericht für das Land Schleswig-Holstein', fileNumber: '2 LA 15/19', content: expect.stringContaining('Die Klage ist zulässig und begründet.') });
  });

  it("passes the portal's own hit total through searchPage", async () => {
    const adapter = new JPortalDecisionAdapter({
      search: async () => ({
        results: [{ docId: 'a', title: 't', subtitle: '', category: 'Rechtsprechung', date: '01.01.2026', docPart: 'L' }],
        totalHits: 2148,
      }),
      get: async () => ({ title: '', head: '', text: '', permalink: '' }),
    });
    await expect(adapter.searchPage('BW', 'Schadensersatz', 1))
      .resolves.toMatchObject({ totalHits: 2148, results: [{ id: 'a' }] });
  });

  it('omits the total when the portal does not report one', async () => {
    const adapter = new JPortalDecisionAdapter({
      search: async () => ({ results: [] }),
      get: async () => ({ title: '', head: '', text: '', permalink: '' }),
    });
    expect(await adapter.searchPage('BW', 'x', 1)).not.toHaveProperty('totalHits');
  });
});
