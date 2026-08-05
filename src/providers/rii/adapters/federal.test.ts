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

  it('extracts court, date, file number and a real title from a live result row', async () => {
    // Copied from a live Trefferliste. The link's own title attribute is the
    // hit's ordinal, so every other field has to come out of the row.
    const row = '<table><tr valign="top">'
      + '<td class="TableUntenContent"><span>28.07.2026</span></td>'
      + '<td class="TableUntenContent">'
      + '<a id="tlid1" class="TrefferlisteHervorheben" title="1. Treffer Langtext" '
      + 'href="page/x?doc.hl=1&amp;doc.id=jb-KORE607392026&amp;numberofresults=6296">'
      + '<span><strong>BGH 6a. Zivilsenat</strong> | VIa ZR 782/23'
      + "<span class='tlAsyncData' style='display:none'> </span><br />"
      + '<em>Urteil</em> | <strong>Der Kläger nimmt die Beklagte wegen der Verwendung '
      + 'unzulässiger Abschalteinrichtungen in Anspruch.</strong></span>'
      + '<br/><span class="docPreview"><br/>... auf Schadensersatz in Anspruch. ...</span>'
      + '</a></td></tr></table>';
    const adapter = new FederalDecisionAdapter({ get: vi.fn(async () => ({ data: row })) });

    const [hit] = await adapter.search('BUND', 'Schadensersatz', 1);

    expect(hit).toMatchObject({
      id: 'jb-KORE607392026',
      date: '28.07.2026',
      court: 'BGH 6a. Zivilsenat',
      // The decision type must not bleed into the file number: the two are
      // separated only by the <br>, which text extraction erases.
      fileNumber: 'VIa ZR 782/23',
    });
    expect(hit?.title).toContain('Der Kläger nimmt die Beklagte');
    expect(hit?.title).not.toContain('Treffer');
    expect(hit?.subtitle).toBe('Urteil | BGH 6a. Zivilsenat | VIa ZR 782/23');
  });

  it('reads the total from numberofresults on a search response', async () => {
    const html = '<input type="hidden" name="numberofresults" value="6296" />'
      + '<a class="TrefferlisteHervorheben" id="tlid1" href="?doc.id=c1">x</a>';
    const adapter = new FederalDecisionAdapter({ get: vi.fn(async () => ({ data: html })) });
    await expect(adapter.searchPage('BUND', 'x', 1)).resolves.toMatchObject({ totalHits: 6296 });
  });
});
