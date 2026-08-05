import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JPortalDecisionAdapter } from './jportal.js';

describe('JPortalDecisionAdapter', () => {
  it('converts an authentic jPortal-shaped decision document', async () => {
    const text = await readFile(new URL('./fixtures/jportal-decision.html', import.meta.url), 'utf8');
    const adapter = new JPortalDecisionAdapter({
      search: async () => [{ docId: 'NJRE001474266', title: 'OVG Schleswig-Holstein', subtitle: 'Beschluss', category: 'Rechtsprechung', date: '30.07.2021', docPart: 'L', snippet: 'Auslegung der Widerspruchserhebung' }],
      get: async () => ({ title: 'Freizeitausgleich für Bereitschaftsdienstzeiten', head: text.slice(0, text.indexOf('<div class="docLayoutNavigation">')), text: text.slice(text.indexOf('<div class="decision">')), permalink: 'https://www.gesetze-rechtsprechung.sh.juris.de/NJRE001474266' }),
    });
    await expect(adapter.search('SH', 'VwVfG', 1)).resolves.toMatchObject([{ id: 'NJRE001474266', snippet: 'Auslegung der Widerspruchserhebung' }]);
    await expect(adapter.get('SH', 'NJRE001474266')).resolves.toMatchObject({ court: 'Oberverwaltungsgericht für das Land Schleswig-Holstein', fileNumber: '2 LA 15/19', content: expect.stringContaining('Die Klage ist zulässig und begründet.') });
  });
});
